export type AIProviderId = 'gemini' | 'groq' | 'openrouter' | 'cloudflare' | 'xai';

export type AIWorkloadType = 'chat' | 'analytics';

export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stopSequences?: string[];
}

export interface AITextRequest {
  messages: AIMessage[];
  model?: string;
  options?: AIGenerationOptions;
  metadata?: Record<string, unknown>;
}

export interface AITokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AITextResponse {
  text: string;
  provider: AIProviderId;
  model: string;
  usage?: AITokenUsage;
  finishReason?: string;
  latencyMs: number;
  raw?: unknown;
}

export interface AIProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  systemInstruction: boolean;
  maxContextTokens?: number;
}

export type AIErrorCategory =
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface AIProviderCredential {
  id: string;
  apiKey: string;
  accountId?: string; // Cloudflare-specific
  enabled: boolean;
  quarantined?: boolean;
  quarantineReason?: string;
  cooldownUntil?: Date | null;
  lastUsedAt?: Date | null;
  lastError?: {
    category: AIErrorCategory;
    message: string;
    timestamp: string;
    retryAfterSeconds?: number;
  } | null;
}

export interface ProviderCredentialStats {
  total: number;
  active: number;
  coolingDown: number;
  quarantined: number;
}

export interface CredentialSummary {
  id: string;
  enabled: boolean;
  isAvailable: boolean;
  quarantined: boolean;
  cooldownUntil: string | null;
  lastUsedAt: string | null;
  lastError: {
    category: AIErrorCategory;
    message: string;
    timestamp: string;
  } | null;
}

export interface AIProviderHealth {
  provider: AIProviderId;
  name: string;
  isConfigured: boolean;
  isAvailable: boolean;
  defaultModel?: string | null;
  cooldownUntil?: string | null;
  credentials?: ProviderCredentialStats;
  lastError?: {
    category: AIErrorCategory;
    message: string;
    timestamp: string;
    retryAfterSeconds?: number;
  } | null;
  lastSuccessAt?: string | null;
}

export interface AIModelInfo {
  id: string;
  name?: string;
  provider: AIProviderId;
  description?: string;
  contextWindow?: number;
  isDefault?: boolean;
}

export interface AIProviderModelDiscovery {
  provider: AIProviderId;
  status: 'discovered' | 'cached' | 'fallback_unverified';
  models: AIModelInfo[];
  error?: string;
}

export interface IAIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  getDefaultModel?(): string | undefined;
  getCapabilities(): AIProviderCapabilities;
  getHealth(): AIProviderHealth;
  getCredentialStats(): ProviderCredentialStats;
  getCredentialSummaries(): CredentialSummary[];
  generateText(request: AITextRequest): Promise<AITextResponse>;
  streamText?(
    request: AITextRequest,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AITextResponse>;
  listAvailableModels?(forceRefresh?: boolean): Promise<AIProviderModelDiscovery>;
}

export interface BackgroundExecutionResult extends AITextResponse {
  attempts: Array<{
    provider: AIProviderId;
    model: string;
    error?: {
      category: AIErrorCategory;
      message: string;
      retryAfterSeconds?: number;
    };
    latencyMs: number;
  }>;
  fallbackOccurred: boolean;
}
