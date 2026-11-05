import { describe, it, expect } from 'vitest';
import { getAIConfig } from '../../src/modules/ai/config';
import { AIProviderRegistry } from '../../src/modules/ai/registry';

describe('AI Configuration & Registry Initialization', () => {
  it('loads sensible defaults when no AI environment variables are set without hardcoding models', () => {
    const config = getAIConfig({});

    expect(config.defaultProvider).toBe('gemini');
    expect(config.defaultTimeoutMs).toBe(30000);
    expect(config.failoverOrder).toEqual(['gemini', 'groq', 'openrouter', 'cloudflare', 'xai']);

    // Models must NOT be hardcoded when not configured
    expect(config.providers.gemini.defaultModel).toBeUndefined();
    expect(config.providers.groq.defaultModel).toBeUndefined();
    expect(config.providers.openrouter.defaultModel).toBeUndefined();
    expect(config.providers.cloudflare.defaultModel).toBeUndefined();
    expect(config.providers.xai.defaultModel).toBeUndefined();

    expect(config.workloads?.chat.defaultModel).toBeUndefined();
    expect(config.workloads?.analytics.defaultModel).toBeUndefined();

    expect(config.providers.gemini.apiKey).toBeUndefined();
  });

  it('correctly parses custom environment variables', () => {
    const customEnv: Record<string, string> = {
      AI_DEFAULT_PROVIDER: 'groq',
      AI_REQUEST_TIMEOUT_MS: '45000',
      AI_FAILOVER_ORDER: 'groq,xai,gemini',
      GROQ_API_KEY: 'gsk-12345',
      GROQ_DEFAULT_MODEL: 'custom-groq-model',
      GEMINI_API_KEY: 'gem-12345',
    };

    const config = getAIConfig(customEnv);

    expect(config.defaultProvider).toBe('groq');
    expect(config.defaultTimeoutMs).toBe(45000);
    expect(config.failoverOrder).toEqual(['groq', 'xai', 'gemini']);
    expect(config.providers.groq.apiKey).toBe('gsk-12345');
    expect(config.providers.groq.defaultModel).toBe('custom-groq-model');
    expect(config.providers.gemini.apiKey).toBe('gem-12345');
  });

  it('unconfigured providers do not crash registry initialization', () => {
    // Registry initialized with empty config
    const emptyConfig = getAIConfig({});
    const registry = new AIProviderRegistry(emptyConfig);

    expect(registry.getAllProviders()).toHaveLength(5);
    expect(registry.getConfiguredProviders()).toHaveLength(0);

    const healthList = registry.getHealthOverview();
    expect(healthList).toHaveLength(5);
    for (const h of healthList) {
      expect(h.isConfigured).toBe(false);
      expect(h.isAvailable).toBe(false);
    }
  });

  it('throws when requesting an unsupported provider ID', () => {
    const registry = new AIProviderRegistry(getAIConfig({}));
    // @ts-expect-error testing invalid ID
    expect(() => registry.getProvider('unsupported-provider')).toThrow(
      'Unknown AI provider: "unsupported-provider"'
    );
  });
});
