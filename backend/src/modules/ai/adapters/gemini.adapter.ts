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

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

interface GeminiResponseCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
    role?: string;
  };
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponseBody {
  candidates?: GeminiResponseCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GeminiModelsResponse {
  models?: Array<{
    name: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

export class GeminiProvider extends BaseAIProvider {
  public readonly id: AIProviderId = 'gemini';
  public readonly name = 'Google Gemini';

  constructor(
    defaultModel?: string,
    credentialsOrKey?: string | AIProviderCredential[] | CredentialPool
  ) {
    super('gemini', defaultModel, credentialsOrKey);
  }

  public getCapabilities(): AIProviderCapabilities {
    return {
      streaming: false,
      toolCalling: false,
      systemInstruction: true,
      maxContextTokens: 1000000,
    };
  }

  protected async doGenerateText(
    request: AITextRequest,
    credential: AIProviderCredential
  ): Promise<AITextResponse> {
    const rawModel = request.model?.trim() || this.defaultModel || '';
    const model = rawModel.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    // Separate system instructions from conversational contents
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const conversationMessages = request.messages.filter((m) => m.role !== 'system');

    const contents: GeminiContent[] = conversationMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    // If only system messages were passed, ensure at least one user content exists
    if (contents.length === 0 && systemMessages.length > 0) {
      contents.push({
        role: 'user',
        parts: [{ text: systemMessages.map((m) => m.content).join('\n') }],
      });
    }

    const body: GeminiRequestBody = { contents };

    if (systemMessages.length > 0 && contents.length > 0 && contents[0].parts[0].text !== systemMessages.map((m) => m.content).join('\n')) {
      body.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join('\n') }],
      };
    }

    if (request.options) {
      body.generationConfig = {
        temperature: request.options.temperature,
        maxOutputTokens: request.options.maxTokens,
        stopSequences: request.options.stopSequences,
      };
    }

    const httpRes = await executeAIHttpRequest<GeminiResponseBody>({
      url,
      method: 'POST',
      headers: {
        'x-goog-api-key': credential.apiKey,
      },
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

    const candidate = httpRes.data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

    const usage: AITokenUsage | undefined = httpRes.data?.usageMetadata
      ? {
          promptTokens: httpRes.data.usageMetadata.promptTokenCount,
          completionTokens: httpRes.data.usageMetadata.candidatesTokenCount,
          totalTokens: httpRes.data.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      text,
      provider: this.id,
      model,
      usage,
      finishReason: candidate?.finishReason,
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

    const url = 'https://generativelanguage.googleapis.com/v1beta/models';
    const httpRes = await executeAIHttpRequest<GeminiModelsResponse>({
      url,
      method: 'GET',
      headers: {
        'x-goog-api-key': cred.apiKey,
      },
      timeoutMs: 10000,
      provider: this.id,
    });

    if (httpRes.status === 200 && Array.isArray(httpRes.data?.models)) {
      return httpRes.data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const cleanId = m.name.replace(/^models\//, '');
          return {
            id: cleanId,
            name: m.displayName || cleanId,
            provider: this.id,
            description: m.description,
            contextWindow: m.inputTokenLimit,
            isDefault: cleanId === this.defaultModel,
          };
        });
    }

    return super.doListAvailableModels();
  }
}
