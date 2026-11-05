import { classifyHttpError, AIProviderError } from '../errors';
import { executeAIHttpRequest } from '../http';
import { CredentialPool } from '../credentialPool';
import type {
  AIModelInfo,
  AIProviderCapabilities,
  AIProviderCredential,
  AIProviderId,
  AITextRequest,
  AITextResponse,
  AITokenUsage,
} from '../types';
import { BaseAIProvider } from './base.adapter';

interface CloudflareRequestBody {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
}

interface CloudflareResponseBody {
  result?: {
    response?: string;
    text?: string;
  };
  success?: boolean;
  errors?: Array<{
    code?: number;
    message?: string;
  }>;
  messages?: string[];
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

interface CloudflareModelsResponse {
  result?: Array<{
    id: string;
    name?: string;
    description?: string;
  }>;
  success?: boolean;
}

export class CloudflareProvider extends BaseAIProvider {
  public readonly id: AIProviderId = 'cloudflare';
  public readonly name = 'Cloudflare Workers AI';
  private readonly defaultAccountId?: string;

  constructor(
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool,
    defaultAccountId?: string
  ) {
    super('cloudflare', defaultModel, credentialsOrKey, defaultAccountId);
    this.defaultAccountId =
      defaultAccountId && defaultAccountId.trim().length > 0
        ? defaultAccountId.trim()
        : undefined;
  }

  public override get isConfigured(): boolean {
    if (!this.pool.isConfigured()) return false;
    const creds = this.pool.getAllCredentials();
    return creds.some((c) => Boolean(c.apiKey && (c.accountId ?? this.defaultAccountId)));
  }

  public getCapabilities(): AIProviderCapabilities {
    return {
      streaming: false,
      toolCalling: false,
      systemInstruction: true,
      maxContextTokens: 8192,
    };
  }

  protected async doGenerateText(
    request: AITextRequest,
    credential: AIProviderCredential
  ): Promise<AITextResponse> {
    const accountId = credential.accountId ?? this.defaultAccountId;
    if (!accountId) {
      throw new AIProviderError({
        category: 'AUTHENTICATION_ERROR',
        provider: this.id,
        message:
          'Cloudflare Workers AI requires an accountId for credential in addition to an API token.',
        isRetryable: false,
      });
    }

    const rawModel = request.model?.trim() || this.defaultModel || '';
    // Format model URI safely (strip leading slash if present)
    const normalizedModel = rawModel.startsWith('/') ? rawModel.slice(1) : rawModel;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${normalizedModel}`;

    const body: CloudflareRequestBody = {
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (request.options) {
      if (request.options.maxTokens !== undefined) {
        body.max_tokens = request.options.maxTokens;
      }
      if (request.options.temperature !== undefined) {
        body.temperature = request.options.temperature;
      }
    }

    const httpRes = await executeAIHttpRequest<CloudflareResponseBody>({
      url,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body,
      timeoutMs: request.options?.timeoutMs,
      provider: this.id,
    });

    if (httpRes.status !== 200 || httpRes.data?.success === false) {
      const errInfo = classifyHttpError(httpRes.status, httpRes.data);
      const cloudflareError = httpRes.data?.errors?.[0]?.message;
      throw new AIProviderError({
        category: errInfo.category,
        provider: this.id,
        message: cloudflareError ? `${errInfo.message} (${cloudflareError})` : errInfo.message,
        statusCode: httpRes.status,
        isRetryable: errInfo.isRetryable,
        retryAfterSeconds: httpRes.retryAfterSeconds,
        originalError: httpRes.data,
      });
    }

    const text = httpRes.data?.result?.response ?? httpRes.data?.result?.text ?? '';

    // Safely extract token usage if available (Cloudflare often omits usage)
    let usage: AITokenUsage | undefined;
    if (httpRes.data?.usage) {
      usage = {
        promptTokens: httpRes.data.usage.prompt_tokens,
        completionTokens: httpRes.data.usage.completion_tokens,
        totalTokens: httpRes.data.usage.total_tokens,
      };
    }

    return {
      text,
      provider: this.id,
      model: rawModel,
      usage,
      latencyMs: httpRes.latencyMs,
      raw: httpRes.data,
    };
  }

  protected override async doListAvailableModels(
    credential?: AIProviderCredential
  ): Promise<AIModelInfo[]> {
    const cred = credential ?? this.pool.getFirstCredential();
    const accountId = cred?.accountId ?? this.defaultAccountId;

    if (!cred || !accountId) {
      return super.doListAvailableModels();
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text%20Generation`;
    const httpRes = await executeAIHttpRequest<CloudflareModelsResponse>({
      url,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cred.apiKey}`,
      },
      timeoutMs: 10000,
      provider: this.id,
    });

    if (httpRes.status === 200 && Array.isArray(httpRes.data?.result)) {
      return httpRes.data.result.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: this.id,
        description: m.description,
        isDefault: m.id === this.defaultModel,
      }));
    }

    return super.doListAvailableModels();
  }
}
