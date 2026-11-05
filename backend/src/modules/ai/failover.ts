import { AIProviderError, AllProvidersFailedError } from './errors';
import { getAIRegistry, AIProviderRegistry } from './registry';
import type {
  AIErrorCategory,
  AIProviderId,
  AITextRequest,
  AITextResponse,
  BackgroundExecutionResult,
} from './types';

export interface BackgroundExecutionOptions {
  preferredProvider?: AIProviderId;
  customOrder?: AIProviderId[];
  maxAttempts?: number;
}

export class AIFailoverEngine {
  private readonly registry: AIProviderRegistry;

  constructor(registry?: AIProviderRegistry) {
    this.registry = registry ?? getAIRegistry();
  }

  /**
   * Executes an interactive AI request using strictly one provider.
   * NEVER silently fails over to another provider.
   * Rate limits and quota exhaustion will produce structured errors.
   */
  public async executeInteractive(
    request: AITextRequest,
    providerId?: AIProviderId
  ): Promise<AITextResponse> {
    const provider = providerId
      ? this.registry.getProvider(providerId)
      : this.registry.getDefaultProvider();

    // Directly execute without failover
    return provider.generateText(request);
  }

  /**
   * Executes a background AI operation with automatic failover across eligible providers.
   * Retries through the next provider only when the failure is retryable.
   * Prioritizes available providers over those currently in a cooldown window.
   * Halts immediately if the error is non-retryable (e.g. malformed request, invalid API key).
   */
  public async executeBackground(
    request: AITextRequest,
    options?: BackgroundExecutionOptions
  ): Promise<BackgroundExecutionResult> {
    const config = this.registry.getConfig();
    const rawOrder: AIProviderId[] = [];

    // 1. Preferred provider comes first if provided
    if (options?.preferredProvider) {
      rawOrder.push(options.preferredProvider);
    }

    // 2. Append custom order or system default failover order
    const defaultOrder = options?.customOrder ?? config.failoverOrder;
    for (const p of defaultOrder) {
      if (!rawOrder.includes(p)) {
        rawOrder.push(p);
      }
    }

    // 3. Separate configured providers into available vs in-cooldown
    const availableProviders: AIProviderId[] = [];
    const coolingDownProviders: AIProviderId[] = [];

    for (const id of rawOrder) {
      try {
        const provider = this.registry.getProvider(id);
        const health = provider.getHealth();
        if (health.isConfigured) {
          if (health.isAvailable) {
            availableProviders.push(id);
          } else {
            coolingDownProviders.push(id);
          }
        }
      } catch {
        // Unknown provider in order list, ignore
      }
    }

    // Prioritize available providers first; fall back to cooling-down providers only if necessary
    const eligibleProviders: AIProviderId[] = [...availableProviders, ...coolingDownProviders];

    if (eligibleProviders.length === 0) {
      throw new AIProviderError({
        category: 'PROVIDER_UNAVAILABLE',
        provider: config.defaultProvider,
        message: 'No configured AI providers available for background execution.',
        isRetryable: false,
      });
    }

    const maxAttempts = options?.maxAttempts
      ? Math.min(options.maxAttempts, eligibleProviders.length)
      : eligibleProviders.length;

    const attemptsToRun = eligibleProviders.slice(0, maxAttempts);
    const attemptsAudit: Array<{
      provider: AIProviderId;
      model: string;
      error?: {
        category: AIErrorCategory;
        message: string;
        retryAfterSeconds?: number;
      };
      latencyMs: number;
    }> = [];

    for (let i = 0; i < attemptsToRun.length; i++) {
      const providerId = attemptsToRun[i];
      const provider = this.registry.getProvider(providerId);

      // Model override protection: A custom model is used for the primary/preferred provider (i === 0).
      // Fallback providers (i > 0) use their own configured default model to prevent passing incompatible model IDs.
      const fallbackModel = provider.getDefaultModel?.();
      if (i > 0 && !fallbackModel) {
        console.warn(`[AI Failover] Provider "${providerId}" has no configured default model. Skipping fallback.`);
        continue;
      }

      const attemptRequest: AITextRequest =
        i === 0
          ? request
          : { ...request, model: fallbackModel };

      const model = attemptRequest.model?.trim() || provider.getDefaultModel?.() || 'unspecified';
      const startTime = Date.now();

      try {
        const response = await provider.generateText(attemptRequest);
        const latencyMs = Date.now() - startTime;

        attemptsAudit.push({
          provider: providerId,
          model: response.model,
          latencyMs,
        });

        // Telemetry logging
        const fallbackOccurred = i > 0;
        if (fallbackOccurred) {
          console.warn(
            `[AI Failover] Background request succeeded using fallback provider "${providerId}" after ${i} failed attempt(s).`
          );
        }

        return {
          ...response,
          attempts: attemptsAudit,
          fallbackOccurred,
        };
      } catch (err: unknown) {
        const latencyMs = Date.now() - startTime;
        const aiError =
          err instanceof AIProviderError
            ? err
            : new AIProviderError({
                category: 'UNKNOWN_PROVIDER_ERROR',
                provider: providerId,
                message: err instanceof Error ? err.message : 'Unknown error during AI execution',
                originalError: err,
              });

        attemptsAudit.push({
          provider: providerId,
          model,
          error: {
            category: aiError.category,
            message: aiError.message,
            retryAfterSeconds: aiError.retryAfterSeconds,
          },
          latencyMs,
        });

        const retryAfterNotice = aiError.retryAfterSeconds ? ` [Retry-After: ${aiError.retryAfterSeconds}s]` : '';
        console.warn(
          `[AI Failover] Attempt ${i + 1}/${attemptsToRun.length} on "${providerId}" failed (${aiError.category}): ${aiError.message}${retryAfterNotice}`
        );

        // Non-retryable errors HALT failover immediately
        if (!aiError.isRetryable) {
          console.error(
            `[AI Failover] Non-retryable error encountered on "${providerId}". Halting failover sequence.`
          );
          throw aiError;
        }

        // If retryable and there are remaining candidates, loop continues without waiting
      }
    }

    // All eligible providers failed with retryable errors
    const errorSummaries = attemptsAudit.map((a) => ({
      provider: a.provider,
      category: a.error?.category ?? 'UNKNOWN_PROVIDER_ERROR',
      message: a.error?.message ?? 'Execution failed without specific error',
      retryAfterSeconds: a.error?.retryAfterSeconds,
    }));

    throw new AllProvidersFailedError(
      `All ${attemptsToRun.length} eligible AI providers failed during background operation.`,
      errorSummaries
    );
  }
}

// Global singleton instance
let defaultEngine: AIFailoverEngine | null = null;

export function getAIFailoverEngine(): AIFailoverEngine {
  if (!defaultEngine) {
    defaultEngine = new AIFailoverEngine();
  }
  return defaultEngine;
}
