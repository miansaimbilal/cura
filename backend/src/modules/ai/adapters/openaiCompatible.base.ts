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

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
}

export interface OpenAIChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
}

interface OpenAIModelsResponse {
  data?: Array<{
    id: string;
    name?: string;
    description?: string;
    context_window?: number;
    context_length?: number;
  }>;
}

export abstract class OpenAICompatibleProvider extends BaseAIProvider {
  protected abstract readonly endpointUrl: string;

  constructor(
    providerId: AIProviderId,
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool
  ) {
    super(providerId, defaultModel, credentialsOrKey);
  }

  protected getExtraHeaders(): Record<string, string> {
    return {};
  }

  protected getModelsUrl(): string {
    return this.endpointUrl.replace(/\/chat\/completions\/?$/, '/models');
  }

  public getCapabilities(): AIProviderCapabilities {
    return {
      streaming: true,
      toolCalling: false,
      systemInstruction: true,
      maxContextTokens: 128000,
    };
  }

  protected async doStreamText(
    request: AITextRequest,
    credential: AIProviderCredential,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AITextResponse> {
    const model = request.model?.trim() || this.defaultModel || '';

    const body: OpenAIChatCompletionRequest & { stream: boolean } = {
      model,
      stream: true,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (request.options) {
      if (request.options.temperature !== undefined) {
        body.temperature = request.options.temperature;
      }
      if (request.options.maxTokens !== undefined) {
        body.max_tokens = request.options.maxTokens;
      }
      if (request.options.stopSequences !== undefined) {
        body.stop = request.options.stopSequences;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential.apiKey}`,
      'Content-Type': 'application/json',
      ...this.getExtraHeaders(),
    };

    const startTime = Date.now();
    let res: Response;

    try {
      res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: unknown) {
      const error = err as Error;
      if (
        signal?.aborted ||
        error.name === 'AbortError' ||
        error.message.toLowerCase().includes('aborted')
      ) {
        throw new AIProviderError({
          category: 'TIMEOUT',
          provider: this.id,
          message: 'Stream request was cancelled by client.',
          isRetryable: false,
          originalError: err,
        });
      }
      throw new AIProviderError({
        category: 'NETWORK_ERROR',
        provider: this.id,
        message: `Network error connecting to ${this.name}: ${error.message}`,
        isRetryable: true,
        originalError: err,
      });
    }

    if (!res.ok) {
      let errorData: unknown;
      try {
        const text = await res.text();
        errorData = text ? JSON.parse(text) : {};
      } catch {
        errorData = {};
      }

      const errInfo = classifyHttpError(res.status, errorData);
      const providerMsg = (errorData as { error?: { message?: string } })?.error?.message;
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;

      throw new AIProviderError({
        category: errInfo.category,
        provider: this.id,
        message: providerMsg ? `${errInfo.message} (${providerMsg})` : errInfo.message,
        statusCode: res.status,
        isRetryable: errInfo.isRetryable,
        retryAfterSeconds,
        originalError: errorData,
      });
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: this.id,
        message: `Provider "${this.name}" returned an empty stream body.`,
        isRetryable: false,
      });
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let finishReason = 'stop';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
              if (parsed.choices?.[0]?.finish_reason) {
                finishReason = parsed.choices[0].finish_reason;
              }
            } catch {
              // ignore unparseable chunk lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      text: fullText,
      provider: this.id,
      model,
      finishReason,
      latencyMs: Date.now() - startTime,
    };
  }

  protected async doGenerateText(
    request: AITextRequest,
    credential: AIProviderCredential
  ): Promise<AITextResponse> {
    const model = request.model?.trim() || this.defaultModel || '';

    const body: OpenAIChatCompletionRequest = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (request.options) {
      if (request.options.temperature !== undefined) {
        body.temperature = request.options.temperature;
      }
      if (request.options.maxTokens !== undefined) {
        body.max_tokens = request.options.maxTokens;
      }
      if (request.options.stopSequences !== undefined) {
        body.stop = request.options.stopSequences;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential.apiKey}`,
      ...this.getExtraHeaders(),
    };

    const httpRes = await executeAIHttpRequest<OpenAIChatCompletionResponse>({
      url: this.endpointUrl,
      method: 'POST',
      headers,
      body,
      timeoutMs: request.options?.timeoutMs,
      provider: this.id,
    });

    if (httpRes.status !== 200 || httpRes.data?.error) {
      const errInfo = classifyHttpError(httpRes.status, httpRes.data);
      const providerMsg = httpRes.data?.error?.message;
      throw new AIProviderError({
        category: errInfo.category,
        provider: this.id,
        message: providerMsg ? `${errInfo.message} (${providerMsg})` : errInfo.message,
        statusCode: httpRes.status,
        isRetryable: errInfo.isRetryable,
        retryAfterSeconds: httpRes.retryAfterSeconds,
        originalError: httpRes.data,
      });
    }

    const choice = httpRes.data?.choices?.[0];
    const text = choice?.message?.content || '';

    const usage: AITokenUsage | undefined = httpRes.data?.usage
      ? {
          promptTokens: httpRes.data.usage.prompt_tokens,
          completionTokens: httpRes.data.usage.completion_tokens,
          totalTokens: httpRes.data.usage.total_tokens,
        }
      : undefined;

    return {
      text,
      provider: this.id,
      model,
      usage,
      finishReason: choice?.finish_reason,
      latencyMs: httpRes.latencyMs,
      raw: httpRes.data,
    };
  }

  protected override async doListAvailableModels(
    credential?: AIProviderCredential
  ): Promise<AIModelInfo[]> {
    const cred = credential ?? this.pool.getFirstCredential();
    if (!cred) {
      return super.doListAvailableModels();
    }

    const url = this.getModelsUrl();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cred.apiKey}`,
      ...this.getExtraHeaders(),
    };

    const httpRes = await executeAIHttpRequest<OpenAIModelsResponse>({
      url,
      method: 'GET',
      headers,
      timeoutMs: 10000,
      provider: this.id,
    });

    if (httpRes.status === 200 && Array.isArray(httpRes.data?.data)) {
      return httpRes.data.data.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: this.id,
        description: m.description,
        contextWindow: m.context_window || m.context_length,
        isDefault: m.id === this.defaultModel,
      }));
    }

    return super.doListAvailableModels();
  }
}
