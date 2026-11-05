import { AIProviderError } from './errors';
import { AIFailoverEngine } from './failover';
import { getAIRegistry, AIProviderRegistry } from './registry';
import type {
  AIProviderId,
  AITextRequest,
  AITextResponse,
  AIWorkloadType,
  BackgroundExecutionResult,
} from './types';

export interface ChatWorkloadOptions {
  provider?: AIProviderId;
  model?: string;
}

export interface AnalyticsWorkloadOptions {
  provider?: AIProviderId;
  model?: string;
  fallbackProviders?: AIProviderId[];
  maxAttempts?: number;
}

export interface WorkloadOptions extends ChatWorkloadOptions, AnalyticsWorkloadOptions {}

export class AIWorkloadRouter {
  private readonly registry: AIProviderRegistry;
  private readonly failoverEngine: AIFailoverEngine;

  constructor(registry?: AIProviderRegistry) {
    this.registry = registry ?? getAIRegistry();
    this.failoverEngine = new AIFailoverEngine(this.registry);
  }

  /**
   * Executes an interactive chat request.
   * - Enforces allowed chat providers (default: 'groq', 'openrouter').
   * - Rotates credentials within the chosen provider on rate limits/quota.
   * - STRICT: Never silently switches providers or models.
   */
  public async executeChat(
    request: AITextRequest,
    options?: ChatWorkloadOptions
  ): Promise<AITextResponse> {
    const config = this.registry.getConfig();
    const chatConfig = config.workloads.chat;
    const targetProvider = options?.provider ?? chatConfig.defaultProvider;

    // Validate provider against allowed chat providers
    if (!chatConfig.allowedProviders.includes(targetProvider)) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: targetProvider,
        message: `Provider "${targetProvider}" is not permitted for the "chat" workload. Allowed providers: ${chatConfig.allowedProviders.join(', ')}.`,
        isRetryable: false,
      });
    }

    const provider = this.registry.getProvider(targetProvider);
    const modelToUse =
      options?.model ??
      request.model ??
      chatConfig.defaultModel ??
      provider.getDefaultModel?.();

    if (!modelToUse) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: targetProvider,
        message: `No model configured for chat workload on provider "${targetProvider}". Please configure AI_CHAT_MODEL or specify a model in request options.`,
        isRetryable: false,
      });
    }

    const modifiedRequest: AITextRequest = {
      ...request,
      model: modelToUse,
    };

    // Execute directly on the selected provider with internal key rotation
    return provider.generateText(modifiedRequest);
  }

  /**
   * Executes an interactive chat request with incremental streaming.
   * - Enforces allowed chat providers (strictly: 'groq', 'openrouter').
   * - Rotates credentials within the chosen provider on rate limits/quota prior to streaming.
   * - STRICT: Never silently switches providers or models.
   */
  public async executeChatStream(
    request: AITextRequest,
    onChunk: (chunk: string) => void,
    options?: ChatWorkloadOptions,
    signal?: AbortSignal
  ): Promise<AITextResponse> {
    const config = this.registry.getConfig();
    const chatConfig = config.workloads.chat;
    const targetProvider = options?.provider ?? chatConfig.defaultProvider;

    // Validate provider against allowed chat providers
    if (!chatConfig.allowedProviders.includes(targetProvider)) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: targetProvider,
        message: `Provider "${targetProvider}" is not permitted for the "chat" workload. Allowed providers: ${chatConfig.allowedProviders.join(', ')}.`,
        isRetryable: false,
      });
    }

    const provider = this.registry.getProvider(targetProvider);
    if (!provider.streamText) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: targetProvider,
        message: `Provider "${targetProvider}" does not implement streaming text.`,
        isRetryable: false,
      });
    }

    const modelToUse =
      options?.model ??
      request.model ??
      chatConfig.defaultModel ??
      provider.getDefaultModel?.();

    if (!modelToUse) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: targetProvider,
        message: `No model configured for chat workload on provider "${targetProvider}". Please configure AI_CHAT_MODEL or specify a model in request options.`,
        isRetryable: false,
      });
    }

    const modifiedRequest: AITextRequest = {
      ...request,
      model: modelToUse,
    };

    return provider.streamText(modifiedRequest, onChunk, signal);
  }

  /**
   * Executes a background analytics / insights operation with multi-provider fallback.
   * - Enforces allowed analytics providers (default: 'gemini', 'openrouter', 'cloudflare').
   * - Rotates credentials within primary provider.
   * - If all credentials fail, falls back to eligible fallback providers in sequence.
   * - Strips primary model override when falling back to avoid cross-provider model incompatibility.
   */
  public async executeAnalytics(
    request: AITextRequest,
    options?: AnalyticsWorkloadOptions
  ): Promise<BackgroundExecutionResult> {
    const config = this.registry.getConfig();
    const analyticsConfig = config.workloads.analytics;
    const targetProvider = options?.provider ?? analyticsConfig.defaultProvider;

    // Validate provider against allowed analytics providers
    if (!analyticsConfig.allowedProviders.includes(targetProvider)) {
      throw new AIProviderError({
        category: 'UNSUPPORTED_CAPABILITY',
        provider: targetProvider,
        message: `Provider "${targetProvider}" is not permitted for the "analytics" workload. Allowed providers: ${analyticsConfig.allowedProviders.join(', ')}.`,
        isRetryable: false,
      });
    }

    const provider = this.registry.getProvider(targetProvider);
    const modelToUse =
      options?.model ??
      request.model ??
      analyticsConfig.defaultModel ??
      provider.getDefaultModel?.();

    if (!modelToUse) {
      throw new AIProviderError({
        category: 'INVALID_REQUEST',
        provider: targetProvider,
        message: `No model configured for analytics workload on provider "${targetProvider}". Please configure AI_ANALYTICS_MODEL or specify a model in request options.`,
        isRetryable: false,
      });
    }

    // Determine custom order: start with target provider, then allowed fallback providers
    const customOrder: AIProviderId[] = [targetProvider];
    const candidateFallbacks = options?.fallbackProviders ?? analyticsConfig.fallbackProviders;

    for (const p of candidateFallbacks) {
      if (analyticsConfig.allowedProviders.includes(p) && !customOrder.includes(p)) {
        customOrder.push(p);
      }
    }

    const modifiedRequest: AITextRequest = {
      ...request,
      model: modelToUse,
    };

    return this.failoverEngine.executeBackground(modifiedRequest, {
      preferredProvider: targetProvider,
      customOrder,
      maxAttempts: options?.maxAttempts,
    });
  }

  /**
   * Generic workload dispatcher.
   */
  public async executeWorkload(
    workload: AIWorkloadType,
    request: AITextRequest,
    options?: WorkloadOptions
  ): Promise<AITextResponse | BackgroundExecutionResult> {
    if (workload === 'chat') {
      return this.executeChat(request, options);
    }
    if (workload === 'analytics') {
      return this.executeAnalytics(request, options);
    }
    throw new AIProviderError({
      category: 'INVALID_REQUEST',
      provider: this.registry.getConfig().defaultProvider,
      message: `Unknown workload type: "${workload}". Supported workloads: chat, analytics.`,
      isRetryable: false,
    });
  }

  /**
   * Returns current workload configuration.
   */
  public getWorkloadSettings() {
    return this.registry.getConfig().workloads;
  }
}

let defaultRouter: AIWorkloadRouter | null = null;

export function getAIRouter(): AIWorkloadRouter {
  if (!defaultRouter) {
    defaultRouter = new AIWorkloadRouter();
  }
  return defaultRouter;
}

export function resetAIRouter(): void {
  defaultRouter = null;
}
