import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIWorkloadRouter } from '../../src/modules/ai/router';
import { AIProviderRegistry } from '../../src/modules/ai/registry';
import { AIProviderError, AllProvidersFailedError } from '../../src/modules/ai/errors';
import type { AIModuleConfig } from '../../src/modules/ai/config';
import type { AITextRequest } from '../../src/modules/ai/types';

describe('AI Workload-Specific Routing & Fallback Policies', () => {
  const originalFetch = globalThis.fetch;

  const mockConfig: AIModuleConfig = {
    defaultProvider: 'groq',
    defaultTimeoutMs: 10000,
    failoverOrder: ['groq', 'openrouter', 'gemini', 'cloudflare'],
    workloads: {
      chat: {
        allowedProviders: ['groq', 'openrouter'],
        defaultProvider: 'groq',
        defaultModel: 'llama-3.3-70b-versatile',
        fallbackProviders: [],
      },
      analytics: {
        allowedProviders: ['gemini', 'openrouter', 'cloudflare'],
        defaultProvider: 'gemini',
        defaultModel: 'gemini-3.8-flash',
        fallbackProviders: ['openrouter', 'cloudflare'],
      },
    },
    providers: {
      gemini: { apiKey: 'key-gemini', defaultModel: 'gemini-3.8-flash' },
      groq: { apiKey: 'key-groq', defaultModel: 'llama-3.3-70b-versatile' },
      openrouter: { apiKey: 'key-openrouter', defaultModel: 'meta-llama/llama-3.3-70b-instruct' },
      cloudflare: { apiKey: 'cf-token', accountId: 'cf-acc', defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      xai: { apiKey: 'key-xai', defaultModel: 'grok-3-latest' },
    },
  };

  const sampleRequest: AITextRequest = {
    messages: [{ role: 'user', content: 'Help me prioritize my tasks for today.' }],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Interactive Chat Workload', () => {
    it('executes successfully on default chat provider (groq)', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain('api.groq.com');
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Focus on your most urgent task first.' } }],
            }),
        };
      });

      const response = await router.executeChat(sampleRequest);
      expect(response.provider).toBe('groq');
      expect(response.model).toBe('llama-3.3-70b-versatile');
      expect(response.text).toBe('Focus on your most urgent task first.');
    });

    it('allows permitted alternative chat provider (openrouter) with custom model', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      let capturedBody: any;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        expect(url).toContain('openrouter.ai');
        capturedBody = JSON.parse(opts.body);
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Take a breath and do one thing.' } }],
            }),
        };
      });

      const response = await router.executeChat(sampleRequest, {
        provider: 'openrouter',
        model: 'mistralai/mistral-small',
      });

      expect(response.provider).toBe('openrouter');
      expect(response.model).toBe('mistralai/mistral-small');
      expect(capturedBody.model).toBe('mistralai/mistral-small');
    });

    it('strictly REJECTS unpermitted providers for chat workload', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      // Gemini is not an allowed provider for interactive chat
      await expect(
        router.executeChat(sampleRequest, { provider: 'gemini' })
      ).rejects.toThrow(AIProviderError);

      try {
        await router.executeChat(sampleRequest, { provider: 'gemini' });
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const aiError = err as AIProviderError;
        expect(aiError.category).toBe('UNSUPPORTED_CAPABILITY');
        expect(aiError.message).toContain('Provider "gemini" is not permitted for the "chat" workload');
      }
    });

    it('returns a clear configuration error when no model is configured or specified in request', async () => {
      const unconfiguredModelConfig: AIModuleConfig = {
        ...mockConfig,
        workloads: {
          ...mockConfig.workloads!,
          chat: {
            ...mockConfig.workloads!.chat,
            defaultModel: undefined,
          },
        },
        providers: {
          ...mockConfig.providers,
          groq: {
            ...mockConfig.providers.groq,
            defaultModel: undefined,
          },
        },
      };

      const registry = new AIProviderRegistry(unconfiguredModelConfig);
      const router = new AIWorkloadRouter(registry);

      await expect(router.executeChat(sampleRequest)).rejects.toThrow(
        /No model configured for chat workload on provider "groq"/
      );
    });

    it('NEVER silently falls back to another provider or model during chat', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      let groqCalls = 0;
      let otherCalls = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('groq.com')) {
          groqCalls++;
          return {
            status: 429,
            headers: new Headers({ 'retry-after': '30' }),
            text: async () => JSON.stringify({ error: { message: 'Rate limited' } }),
          };
        }
        otherCalls++;
        return {
          status: 200,
          headers: new Headers(),
          text: async () => JSON.stringify({ choices: [{ message: { content: 'Fallback' } }] }),
        };
      });

      await expect(router.executeChat(sampleRequest)).rejects.toThrow();

      // Ensure NO silent fallback was triggered to any other provider!
      expect(groqCalls).toBe(1);
      expect(otherCalls).toBe(0);
    });
  });

  describe('Background Analytics & Insights Workload', () => {
    it('executes successfully on default analytics provider (gemini)', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain('generativelanguage.googleapis.com');
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Weekly mood insight: improving.' }] } }],
            }),
        };
      });

      const response = await router.executeAnalytics(sampleRequest);
      expect(response.provider).toBe('gemini');
      expect(response.model).toBe('gemini-3.8-flash');
      expect(response.text).toBe('Weekly mood insight: improving.');
      expect(response.fallbackOccurred).toBe(false);
    });

    it('strictly REJECTS unpermitted providers for analytics workload', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      // Groq is allowed for chat, but NOT for analytics workload
      await expect(
        router.executeAnalytics(sampleRequest, { provider: 'groq' })
      ).rejects.toThrow(AIProviderError);

      try {
        await router.executeAnalytics(sampleRequest, { provider: 'groq' });
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const aiError = err as AIProviderError;
        expect(aiError.category).toBe('UNSUPPORTED_CAPABILITY');
        expect(aiError.message).toContain('Provider "groq" is not permitted for the "analytics" workload');
      }
    });

    it('falls back to secondary allowed provider (openrouter) when primary (gemini) fails with rate limit', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('generativelanguage.googleapis.com')) {
          return {
            status: 429,
            headers: new Headers({ 'retry-after': '60' }),
            text: async () => JSON.stringify({ error: { message: 'Quota exceeded' } }),
          };
        }
        if (url.includes('openrouter.ai')) {
          return {
            status: 200,
            headers: new Headers(),
            text: async () =>
              JSON.stringify({
                choices: [{ message: { content: 'Analytics generated via OpenRouter.' } }],
              }),
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const response = await router.executeAnalytics(sampleRequest);
      expect(response.provider).toBe('openrouter');
      expect(response.fallbackOccurred).toBe(true);
      expect(response.attempts).toHaveLength(2);
      expect(response.attempts[0].provider).toBe('gemini');
      expect(response.attempts[0].error?.category).toBe('QUOTA_EXCEEDED');
      expect(response.attempts[1].provider).toBe('openrouter');
    });

    it('does NOT pass primary model override to fallback provider during analytics fallback', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      let openRouterReceivedModel: string | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('generativelanguage.googleapis.com')) {
          return {
            status: 503,
            headers: new Headers(),
            text: async () => JSON.stringify({ error: 'Service Unavailable' }),
          };
        }
        if (url.includes('openrouter.ai')) {
          const body = JSON.parse(opts.body);
          openRouterReceivedModel = body.model;
          return {
            status: 200,
            headers: new Headers(),
            text: async () =>
              JSON.stringify({
                choices: [{ message: { content: 'Fallback ok' } }],
              }),
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      // Pass Gemini-specific custom model
      const response = await router.executeAnalytics(sampleRequest, {
        provider: 'gemini',
        model: 'gemini-exp-custom',
      });

      expect(response.provider).toBe('openrouter');
      // Verify OpenRouter was NOT sent 'gemini-exp-custom', but rather its own configured model!
      expect(openRouterReceivedModel).toBe('meta-llama/llama-3.3-70b-instruct');
      expect(openRouterReceivedModel).not.toBe('gemini-exp-custom');
    });

    it('throws AllProvidersFailedError when all allowed analytics providers fail', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 503,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: '503 Service Unavailable' }),
      });

      await expect(router.executeAnalytics(sampleRequest)).rejects.toThrow(
        AllProvidersFailedError
      );
    });
  });

  describe('Generic executeWorkload dispatcher', () => {
    it('dispatches to chat and analytics accordingly', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Success' } }],
          }),
      });

      const chatRes = await router.executeWorkload('chat', sampleRequest);
      expect(chatRes.provider).toBe('groq');

      await expect(
        router.executeWorkload('unsupported_workload' as any, sampleRequest)
      ).rejects.toThrow(AIProviderError);
    });
  });
});
