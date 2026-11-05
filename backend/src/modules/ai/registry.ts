import { CloudflareProvider } from './adapters/cloudflare.adapter';
import { GeminiProvider } from './adapters/gemini.adapter';
import { GroqProvider } from './adapters/groq.adapter';
import { OpenRouterProvider } from './adapters/openrouter.adapter';
import { XAIProvider } from './adapters/xai.adapter';
import { getAIConfig, DEFAULT_AI_WORKLOADS, type AIModuleConfig } from './config';
import { AIProviderError } from './errors';
import type { AIProviderHealth, AIProviderId, IAIProvider } from './types';

export class AIProviderRegistry {
  private readonly providers: Map<AIProviderId, IAIProvider> = new Map();
  private readonly config: AIModuleConfig;

  constructor(config?: AIModuleConfig) {
    this.config = config ?? getAIConfig();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const p = this.config.providers;

    const geminiCreds = p.gemini.credentials?.length ? p.gemini.credentials : p.gemini.apiKey;
    const groqCreds = p.groq.credentials?.length ? p.groq.credentials : p.groq.apiKey;
    const openrouterCreds = p.openrouter.credentials?.length
      ? p.openrouter.credentials
      : p.openrouter.apiKey;
    const cloudflareCreds = p.cloudflare.credentials?.length
      ? p.cloudflare.credentials
      : p.cloudflare.apiKey;
    const xaiCreds = p.xai.credentials?.length ? p.xai.credentials : p.xai.apiKey;

    this.providers.set('gemini', new GeminiProvider(p.gemini.defaultModel, geminiCreds));
    this.providers.set('groq', new GroqProvider(p.groq.defaultModel, groqCreds));
    this.providers.set(
      'openrouter',
      new OpenRouterProvider(p.openrouter.defaultModel, openrouterCreds)
    );
    this.providers.set(
      'cloudflare',
      new CloudflareProvider(
        p.cloudflare.defaultModel,
        cloudflareCreds,
        p.cloudflare.accountId
      )
    );
    this.providers.set('xai', new XAIProvider(p.xai.defaultModel, xaiCreds));
  }

  public getProvider(id: AIProviderId): IAIProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AIProviderError({
        category: 'MODEL_UNAVAILABLE',
        provider: id,
        message: `Unknown AI provider: "${id}". Supported providers: gemini, groq, openrouter, cloudflare, xai.`,
        isRetryable: false,
      });
    }
    return provider;
  }

  public getDefaultProvider(): IAIProvider {
    return this.getProvider(this.config.defaultProvider);
  }

  public getAllProviders(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  public getConfiguredProviders(): IAIProvider[] {
    return this.getAllProviders().filter((p) => p.getHealth().isConfigured);
  }

  public getHealthOverview(): AIProviderHealth[] {
    return this.getAllProviders().map((p) => p.getHealth());
  }

  public getConfig(): AIModuleConfig & { workloads: typeof DEFAULT_AI_WORKLOADS } {
    return {
      ...this.config,
      workloads: this.config.workloads ?? DEFAULT_AI_WORKLOADS,
    };
  }
}

// Global singleton instance initialized from process.env
let defaultRegistry: AIProviderRegistry | null = null;

export function getAIRegistry(): AIProviderRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new AIProviderRegistry();
  }
  return defaultRegistry;
}

export function resetAIRegistry(): void {
  defaultRegistry = null;
}
