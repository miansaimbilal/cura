import { AIProviderError, AllCredentialsExhaustedError } from '../errors';
import { CredentialPool } from '../credentialPool';
import type {
  AIModelInfo,
  AIProviderCapabilities,
  AIProviderCredential,
  AIProviderHealth,
  AIProviderId,
  AIProviderModelDiscovery,
  AITextRequest,
  AITextResponse,
  CredentialSummary,
  IAIProvider,
  ProviderCredentialStats,
} from '../types';

export abstract class BaseAIProvider implements IAIProvider {
  public abstract readonly id: AIProviderId;
  public abstract readonly name: string;
  protected readonly defaultModel?: string;
  protected readonly pool: CredentialPool;

  protected cachedModels: AIModelInfo[] | null = null;
  protected cacheExpiresAt: number = 0;
  protected readonly CACHE_TTL_MS: number = 300000; // 5 minutes TTL

  protected cooldownUntil: Date | null = null;
  protected lastError: {
    category: AIProviderError['category'];
    message: string;
    timestamp: string;
    retryAfterSeconds?: number;
  } | null = null;
  protected lastSuccessAt: string | null = null;

  constructor(
    providerId: AIProviderId,
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool,
    accountId?: string
  ) {
    this.defaultModel = defaultModel && defaultModel.trim().length > 0 ? defaultModel.trim() : undefined;
    if (credentialsOrKey instanceof CredentialPool) {
      this.pool = credentialsOrKey;
    } else if (Array.isArray(credentialsOrKey)) {
      this.pool = new CredentialPool(providerId, credentialsOrKey);
    } else if (typeof credentialsOrKey === 'string' && credentialsOrKey.trim().length > 0) {
      this.pool = new CredentialPool(providerId, [
        {
          id: `${providerId}_primary`,
          apiKey: credentialsOrKey.trim(),
          accountId: accountId?.trim() || undefined,
          enabled: true,
        },
      ]);
    } else {
      this.pool = new CredentialPool(providerId, []);
    }
  }

  public get isConfigured(): boolean {
    return this.pool.isConfigured();
  }

  public getDefaultModel(): string | undefined {
    return this.defaultModel;
  }

  public getCredentialPool(): CredentialPool {
    return this.pool;
  }

  public getCredentialStats(): ProviderCredentialStats {
    return this.pool.getStats();
  }

  public getCredentialSummaries(): CredentialSummary[] {
    return this.pool.getCredentialSummaries();
  }

  public abstract getCapabilities(): AIProviderCapabilities;

  public getHealth(): AIProviderHealth {
    const isConfigured = this.isConfigured;
    const stats = this.pool.getStats();
    const isAvailable = isConfigured && stats.active > 0;
    const nextCooldownSec = this.pool.getNextCooldownSeconds();

    return {
      provider: this.id,
      name: this.name,
      isConfigured,
      isAvailable,
      defaultModel: this.defaultModel ?? null,
      cooldownUntil: nextCooldownSec
        ? new Date(Date.now() + nextCooldownSec * 1000).toISOString()
        : null,
      credentials: stats,
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  public async generateText(request: AITextRequest): Promise<AITextResponse> {
    if (!this.isConfigured) {
      throw new AIProviderError({
        category: 'AUTHENTICATION_ERROR',
        provider: this.id,
        message: `Provider ${this.name} (${this.id}) is not configured. Missing API credentials.`,
        isRetryable: false,
      });
    }

    if (!request.messages || request.messages.length === 0) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: this.id,
        message: 'Request must contain at least one message.',
        isRetryable: false,
      });
    }

    const resolvedModel = request.model?.trim() || this.defaultModel;
    if (!resolvedModel) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: this.id,
        message: `No model specified or configured for provider "${this.name}" (${this.id}). Please specify a model in request options or set environment configuration.`,
        isRetryable: false,
      });
    }

    const requestWithModel: AITextRequest = {
      ...request,
      model: resolvedModel,
    };

    const attemptedKeyIds = new Set<string>();
    let lastEncounteredError: AIProviderError | null = null;

    while (true) {
      let credential = this.pool.getEligibleCredential(attemptedKeyIds);

      // If all active credentials are in cooldown and we haven't attempted any key yet,
      // allow testing the credential with earliest cooldown so the provider can recover.
      if (!credential && attemptedKeyIds.size === 0) {
        credential = this.pool.getEarliestCooldownCredential(attemptedKeyIds);
      }

      if (!credential) {
        if (attemptedKeyIds.size > 0 && lastEncounteredError) {
          if (attemptedKeyIds.size === 1) {
            throw lastEncounteredError;
          }
          const nextCooldownSec = this.pool.getNextCooldownSeconds();
          throw new AIProviderError({
            category: lastEncounteredError.category,
            provider: this.id,
            message: `All ${attemptedKeyIds.size} configured credentials for provider "${this.name}" failed: ${lastEncounteredError.message}`,
            statusCode: lastEncounteredError.statusCode,
            isRetryable: lastEncounteredError.isRetryable,
            retryAfterSeconds: nextCooldownSec ?? lastEncounteredError.retryAfterSeconds,
          });
        }

        const nextCooldownSec = this.pool.getNextCooldownSeconds();
        throw new AllCredentialsExhaustedError(
          this.id,
          `No active credentials currently available for provider "${this.name}". All credentials are in cooldown or quarantined.`,
          nextCooldownSec
        );
      }

      attemptedKeyIds.add(credential.id);

      try {
        const response = await this.doGenerateText(requestWithModel, credential);
        this.pool.markSuccess(credential.id);
        this.recordSuccess();
        return response;
      } catch (err: unknown) {
        const aiError =
          err instanceof AIProviderError
            ? err
            : new AIProviderError({
                category: 'UNKNOWN_PROVIDER_ERROR',
                provider: this.id,
                message: err instanceof Error ? err.message : 'Unknown provider error occurred',
                originalError: err,
              });

        lastEncounteredError = aiError;
        this.recordFailure(aiError);

        // 1. Rate Limit (429) -> Cooldown key, rotate to next key
        if (aiError.category === 'RATE_LIMITED') {
          this.pool.markRateLimited(credential.id, aiError.retryAfterSeconds);
          continue;
        }

        // 2. Quota Exhaustion or Account Usage Restriction (403) -> Cooldown key, rotate to next key
        if (aiError.category === 'QUOTA_EXCEEDED') {
          this.pool.markQuotaExceeded(credential.id, aiError.retryAfterSeconds);
          continue;
        }

        // 3. 401 Unauthorized / Invalid Key -> Quarantine key, rotate to next key
        if (aiError.category === 'AUTHENTICATION_ERROR') {
          if (
            aiError.statusCode === 401 ||
            aiError.message.toLowerCase().includes('api key') ||
            aiError.message.toLowerCase().includes('token') ||
            aiError.message.toLowerCase().includes('unauthorized')
          ) {
            this.pool.quarantine(credential.id, aiError.message);
            continue;
          }
          // General 403 Forbidden: do NOT blindly rotate through all keys!
          throw aiError;
        }

        // 4. Model Permission / Model Unavailable / Invalid Request / Unsupported Capability:
        // DO NOT rotate keys! Rethrow immediately.
        if (
          aiError.category === 'INVALID_REQUEST' ||
          aiError.category === 'MODEL_UNAVAILABLE' ||
          aiError.category === 'UNSUPPORTED_CAPABILITY'
        ) {
          throw aiError;
        }

        // Server error or timeout: if another credential exists, retry with next credential
        if (this.pool.getEligibleCredential(attemptedKeyIds)) {
          continue;
        }

        throw aiError;
      }
    }
  }

  /**
   * Discovers available models for this provider using current credentials.
   * Clearly distinguishes:
   * - 'discovered': fresh live response from provider endpoint
   * - 'cached': served from in-memory cache
   * - 'fallback_unverified': provider API unreachable or unconfigured
   */
  public async listAvailableModels(forceRefresh = false): Promise<AIProviderModelDiscovery> {
    const credential = this.pool.getEligibleCredential() ?? this.pool.getFirstCredential();

    if (!this.isConfigured || !credential) {
      return {
        provider: this.id,
        status: 'fallback_unverified',
        models: this.defaultModel
          ? [
              {
                id: this.defaultModel,
                name: `${this.name} Default (Unconfigured)`,
                provider: this.id,
                isDefault: true,
              },
            ]
          : [],
        error: `Provider ${this.name} (${this.id}) is not configured with API credentials.`,
      };
    }

    // Serve from cache if fresh and not force-refreshing
    if (!forceRefresh && this.cachedModels && Date.now() < this.cacheExpiresAt) {
      return {
        provider: this.id,
        status: 'cached',
        models: this.cachedModels,
      };
    }

    try {
      const models = await this.doListAvailableModels(credential);
      if (models && models.length > 0) {
        this.cachedModels = models;
        this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
        return {
          provider: this.id,
          status: 'discovered',
          models,
        };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Model discovery endpoint failed';

      // If we have stale cache, return cached models with error annotation
      if (this.cachedModels && this.cachedModels.length > 0) {
        return {
          provider: this.id,
          status: 'cached',
          models: this.cachedModels,
          error: `Live discovery failed: ${errMsg}. Serving cached models.`,
        };
      }

      return {
        provider: this.id,
        status: 'fallback_unverified',
        models: this.defaultModel
          ? [
              {
                id: this.defaultModel,
                name: `${this.name} Configured Default (Unverified)`,
                provider: this.id,
                isDefault: true,
              },
            ]
          : [],
        error: errMsg,
      };
    }

    return {
      provider: this.id,
      status: 'fallback_unverified',
      models: this.defaultModel
        ? [
            {
              id: this.defaultModel,
              name: `${this.name} Configured Default`,
              provider: this.id,
              isDefault: true,
            },
          ]
        : [],
      error: 'No models returned from provider API.',
    };
  }

  protected recordSuccess(): void {
    this.lastSuccessAt = new Date().toISOString();
    this.cooldownUntil = null;
  }

  protected recordFailure(error: AIProviderError): void {
    this.lastError = {
      category: error.category,
      message: error.message,
      timestamp: new Date().toISOString(),
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  protected abstract doGenerateText(
    request: AITextRequest,
    credential: AIProviderCredential
  ): Promise<AITextResponse>;

  protected doStreamText?(
    request: AITextRequest,
    credential: AIProviderCredential,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AITextResponse>;

  public async streamText(
    request: AITextRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AITextResponse> {
    if (!this.isConfigured) {
      throw new AIProviderError({
        category: 'AUTHENTICATION_ERROR',
        provider: this.id,
        message: `Provider ${this.name} (${this.id}) is not configured. Missing API credentials.`,
        isRetryable: false,
      });
    }

    if (!request.messages || request.messages.length === 0) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: this.id,
        message: 'Request must contain at least one message.',
        isRetryable: false,
      });
    }

    if (!this.doStreamText) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: this.id,
        message: `Provider "${this.name}" does not support streaming text responses.`,
        isRetryable: false,
      });
    }

    const resolvedModel = request.model?.trim() || this.defaultModel;
    if (!resolvedModel) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: this.id,
        message: `No model specified or configured for provider "${this.name}" (${this.id}). Please specify a model in request options or set environment configuration.`,
        isRetryable: false,
      });
    }

    const requestWithModel: AITextRequest = {
      ...request,
      model: resolvedModel,
    };

    const attemptedKeyIds = new Set<string>();
    let lastEncounteredError: AIProviderError | null = null;

    while (true) {
      if (signal?.aborted) {
        throw new AIProviderError({
          category: 'TIMEOUT',
          provider: this.id,
          message: 'Stream request was cancelled by client.',
          isRetryable: false,
        });
      }

      let credential = this.pool.getEligibleCredential(attemptedKeyIds);
      if (!credential && attemptedKeyIds.size === 0) {
        credential = this.pool.getEarliestCooldownCredential(attemptedKeyIds);
      }

      if (!credential) {
        if (attemptedKeyIds.size > 0 && lastEncounteredError) {
          if (attemptedKeyIds.size === 1) {
            throw lastEncounteredError;
          }
          const nextCooldownSec = this.pool.getNextCooldownSeconds();
          throw new AIProviderError({
            category: lastEncounteredError.category,
            provider: this.id,
            message: `All ${attemptedKeyIds.size} configured credentials for provider "${this.name}" failed: ${lastEncounteredError.message}`,
            statusCode: lastEncounteredError.statusCode,
            isRetryable: lastEncounteredError.isRetryable,
            retryAfterSeconds: nextCooldownSec ?? lastEncounteredError.retryAfterSeconds,
          });
        }

        const nextCooldownSec = this.pool.getNextCooldownSeconds();
        throw new AllCredentialsExhaustedError(
          this.id,
          `No active credentials currently available for provider "${this.name}". All credentials are in cooldown or quarantined.`,
          nextCooldownSec
        );
      }

      attemptedKeyIds.add(credential.id);
      let chunksEmitted = 0;

      try {
        const response = await this.doStreamText(
          requestWithModel,
          credential,
          (chunk: string) => {
            chunksEmitted++;
            onChunk(chunk);
          },
          signal
        );
        this.pool.markSuccess(credential.id);
        this.recordSuccess();
        return response;
      } catch (err: unknown) {
        const error = err as Error;
        const isClientAbort =
          signal?.aborted ||
          error.name === 'AbortError' ||
          error.message.toLowerCase().includes('aborted') ||
          error.message.toLowerCase().includes('cancelled');

        if (isClientAbort) {
          throw new AIProviderError({
            category: 'TIMEOUT',
            provider: this.id,
            message: 'Stream was aborted by the client.',
            isRetryable: false,
            originalError: err,
          });
        }

        const aiError =
          err instanceof AIProviderError
            ? err
            : new AIProviderError({
                category: 'UNKNOWN_PROVIDER_ERROR',
                provider: this.id,
                message: error.message || 'Unknown provider error occurred during streaming',
                originalError: err,
              });

        lastEncounteredError = aiError;
        this.recordFailure(aiError);

        // If chunks were already delivered to the client, we cannot transparently re-stream with a new key
        if (chunksEmitted > 0) {
          if (aiError.category === 'RATE_LIMITED') {
            this.pool.markRateLimited(credential.id, aiError.retryAfterSeconds);
          } else if (aiError.category === 'QUOTA_EXCEEDED') {
            this.pool.markQuotaExceeded(credential.id, aiError.retryAfterSeconds);
          }
          throw aiError;
        }

        // Rate limit (429) -> Cooldown key, rotate to next key
        if (aiError.category === 'RATE_LIMITED') {
          this.pool.markRateLimited(credential.id, aiError.retryAfterSeconds);
          continue;
        }

        // Quota exhaustion (403) -> Cooldown key, rotate to next key
        if (aiError.category === 'QUOTA_EXCEEDED') {
          this.pool.markQuotaExceeded(credential.id, aiError.retryAfterSeconds);
          continue;
        }

        // 401 Unauthorized / Invalid Key -> Quarantine key, rotate to next key
        if (aiError.category === 'AUTHENTICATION_ERROR') {
          if (
            aiError.statusCode === 401 ||
            aiError.message.toLowerCase().includes('api key') ||
            aiError.message.toLowerCase().includes('token') ||
            aiError.message.toLowerCase().includes('unauthorized')
          ) {
            this.pool.quarantine(credential.id, aiError.message);
            continue;
          }
          throw aiError;
        }

        // Model Permission / Model Unavailable / Invalid Request: do not rotate!
        if (
          aiError.category === 'INVALID_REQUEST' ||
          aiError.category === 'MODEL_UNAVAILABLE' ||
          aiError.category === 'UNSUPPORTED_CAPABILITY'
        ) {
          throw aiError;
        }

        if (this.pool.getEligibleCredential(attemptedKeyIds)) {
          continue;
        }

        throw aiError;
      }
    }
  }

  protected async doListAvailableModels(
    _credential?: AIProviderCredential
  ): Promise<AIModelInfo[]> {
    return this.defaultModel
      ? [
          {
            id: this.defaultModel,
            name: `${this.name} Default`,
            provider: this.id,
            isDefault: true,
          },
        ]
      : [];
  }
}
