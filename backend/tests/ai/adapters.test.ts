import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../../src/modules/ai/adapters/gemini.adapter';
import { GroqProvider } from '../../src/modules/ai/adapters/groq.adapter';
import { OpenRouterProvider } from '../../src/modules/ai/adapters/openrouter.adapter';
import { CloudflareProvider } from '../../src/modules/ai/adapters/cloudflare.adapter';
import { XAIProvider } from '../../src/modules/ai/adapters/xai.adapter';
import type { IAIProvider, AITextRequest } from '../../src/modules/ai/types';

describe('AI Provider Abstraction & Adapters', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Interface Conformance', () => {
    it('all five adapters satisfy the IAIProvider contract', () => {
      const gemini: IAIProvider = new GeminiProvider('gemini-3.8-flash', 'test-gemini-key');
      const groq: IAIProvider = new GroqProvider('llama-3.3-70b-versatile', 'test-groq-key');
      const openrouter: IAIProvider = new OpenRouterProvider('meta-llama/llama-3.3-70b-instruct', 'test-openrouter-key');
      const cloudflare: IAIProvider = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'test-cf-token', 'test-cf-account');
      const xai: IAIProvider = new XAIProvider('grok-3-latest', 'test-xai-key');

      const providers = [gemini, groq, openrouter, cloudflare, xai];

      for (const p of providers) {
        expect(p).toHaveProperty('id');
        expect(p).toHaveProperty('name');
        expect(typeof p.getCapabilities).toBe('function');
        expect(typeof p.getHealth).toBe('function');
        expect(typeof p.generateText).toBe('function');

        const caps = p.getCapabilities();
        expect(caps).toHaveProperty('streaming');
        expect(caps).toHaveProperty('systemInstruction');

        const health = p.getHealth();
        expect(health).toHaveProperty('provider', p.id);
        expect(health).toHaveProperty('isConfigured', true);
        expect(health).toHaveProperty('isAvailable', true);
      }
    });

    it('rejects unconfigured providers when attempting text generation', async () => {
      const unconfigured = new GeminiProvider('gemini-3.8-flash', '');
      expect(unconfigured.getHealth().isConfigured).toBe(false);
      expect(unconfigured.getHealth().isAvailable).toBe(false);

      await expect(
        unconfigured.generateText({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('Provider Google Gemini (gemini) is not configured');
    });

    it('rejects requests with empty messages array', async () => {
      const provider = new GroqProvider('llama-3.3-70b-versatile', 'dummy-key');
      await expect(
        provider.generateText({
          messages: [],
        })
      ).rejects.toThrow('Request must contain at least one message');
    });
  });

  describe('Google Gemini Adapter', () => {
    it('normalizes successful response and token usage', async () => {
      const provider = new GeminiProvider('gemini-3.8-flash', 'fake-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Take a deep breath and start small.' }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 8,
              totalTokenCount: 23,
            },
          }),
      });

      const request: AITextRequest = {
        messages: [
          { role: 'system', content: 'You are a calm companion.' },
          { role: 'user', content: 'I feel overwhelmed.' },
        ],
        options: { temperature: 0.7, maxTokens: 100 },
      };

      const result = await provider.generateText(request);

      expect(result.text).toBe('Take a deep breath and start small.');
      expect(result.provider).toBe('gemini');
      expect(result.model).toBe('gemini-3.8-flash');
      expect(result.finishReason).toBe('STOP');
      expect(result.usage).toEqual({
        promptTokens: 15,
        completionTokens: 8,
        totalTokens: 23,
      });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handles missing usageMetadata gracefully', async () => {
      const provider = new GeminiProvider('gemini-3.8-flash', 'fake-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Here to support you.' }],
                },
              },
            ],
          }),
      });

      const result = await provider.generateText({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.text).toBe('Here to support you.');
      expect(result.usage).toBeUndefined();
    });
  });

  describe('Groq Adapter', () => {
    it('normalizes OpenAI-compatible response and usage', async () => {
      const provider = new GroqProvider('llama-3.3-70b-versatile', 'gsk-fake-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'chatcmpl-123',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'A gentle reminder to be kind to yourself.',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 9,
              total_tokens: 21,
            },
          }),
      });

      const result = await provider.generateText({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.text).toBe('A gentle reminder to be kind to yourself.');
      expect(result.provider).toBe('groq');
      expect(result.model).toBe('llama-3.3-70b-versatile');
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({
        promptTokens: 12,
        completionTokens: 9,
        totalTokens: 21,
      });
    });
  });

  describe('OpenRouter Adapter', () => {
    it('includes required HTTP-Referer header and parses response', async () => {
      const provider = new OpenRouterProvider('meta-llama/llama-3.3-70b-instruct', 'sk-or-fake-key');
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedHeaders = opts.headers as Record<string, string>;
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'One step at a time.' } }],
            }),
        };
      });

      const result = await provider.generateText({
        messages: [{ role: 'user', content: 'Help' }],
      });

      expect(result.text).toBe('One step at a time.');
      expect(result.provider).toBe('openrouter');
      expect(capturedHeaders['HTTP-Referer']).toBe('https://cura.app');
      expect(capturedHeaders['Authorization']).toBe('Bearer sk-or-fake-key');
    });
  });

  describe('Cloudflare Workers AI Adapter', () => {
    it('requires both API token and account ID to be configured', () => {
      const missingAccount = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'token-only', '');
      expect(missingAccount.getHealth().isConfigured).toBe(false);

      const missingToken = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', '', 'account-only');
      expect(missingToken.getHealth().isConfigured).toBe(false);

      const fullyConfigured = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'token', 'account');
      expect(fullyConfigured.getHealth().isConfigured).toBe(true);
    });

    it('normalizes result.response payload format and handles missing usage', async () => {
      const provider = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'token', 'my-account');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            result: {
              response: 'Remember that resting is productive too.',
            },
            success: true,
            errors: [],
          }),
      });

      const result = await provider.generateText({
        messages: [{ role: 'user', content: 'I need a break' }],
      });

      expect(result.text).toBe('Remember that resting is productive too.');
      expect(result.provider).toBe('cloudflare');
      expect(result.usage).toBeUndefined();
    });
  });

  describe('xAI Grok Adapter', () => {
    it('normalizes Grok response format', async () => {
      const provider = new XAIProvider('grok-3-latest', 'xai-key-123');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: 'Calmly focus on what is in your control.' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 10,
              total_tokens: 20,
            },
          }),
      });

      const result = await provider.generateText({
        messages: [{ role: 'user', content: 'Guide me' }],
      });

      expect(result.text).toBe('Calmly focus on what is in your control.');
      expect(result.provider).toBe('xai');
      expect(result.model).toBe('grok-3-latest');
      expect(result.usage?.totalTokens).toBe(20);
    });
  });

  describe('Model Configuration Flexibility & Dynamic Overrides', () => {
    it('uses request.model override instead of default model across providers', async () => {
      const groq = new GroqProvider('llama-3.3-70b-versatile', 'test-key');
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Response from 8B model' } }],
            }),
        };
      });

      const res = await groq.generateText({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Quick task' }],
      });

      expect(res.model).toBe('llama-3.1-8b-instant');
      expect(capturedBody.model).toBe('llama-3.1-8b-instant');
    });

    it('falls back cleanly to defaultModel when model is omitted or whitespace', async () => {
      const xai = new XAIProvider('grok-3-latest', 'test-key');
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Response' } }],
            }),
        };
      });

      const res = await xai.generateText({
        model: '   ',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(res.model).toBe('grok-3-latest');
      expect(capturedBody.model).toBe('grok-3-latest');
    });
  });

  describe('Model Catalogue Discovery', () => {
    it('Gemini listAvailableModels retrieves and filters generation models with discovered status', async () => {
      const gemini = new GeminiProvider('gemini-3.8-flash', 'test-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-3.8-flash',
                displayName: 'Gemini 3.8 Flash',
                supportedGenerationMethods: ['generateContent', 'countTokens'],
                inputTokenLimit: 1048576,
              },
              {
                name: 'models/text-embedding-004',
                displayName: 'Text Embedding',
                supportedGenerationMethods: ['embedContent'],
              },
            ],
          }),
      });

      const discovery = await gemini.listAvailableModels();
      expect(discovery.status).toBe('discovered');
      expect(discovery.models).toHaveLength(1);
      expect(discovery.models[0].id).toBe('gemini-3.8-flash');
      expect(discovery.models[0].name).toBe('Gemini 3.8 Flash');
      expect(discovery.models[0].isDefault).toBe(true);
    });

    it('Groq listAvailableModels maps models correctly with discovered status', async () => {
      const groq = new GroqProvider('llama-3.3-70b-versatile', 'test-key');

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              { id: 'llama-3.3-70b-versatile', context_window: 131072 },
              { id: 'llama-3.1-8b-instant', context_window: 131072 },
            ],
          }),
      });

      const discovery = await groq.listAvailableModels();
      expect(discovery.status).toBe('discovered');
      expect(discovery.models).toHaveLength(2);
      expect(discovery.models[0].id).toBe('llama-3.3-70b-versatile');
      expect(discovery.models[0].isDefault).toBe(true);
      expect(discovery.models[1].id).toBe('llama-3.1-8b-instant');
      expect(discovery.models[1].isDefault).toBe(false);
    });

    it('clearly reports fallback_unverified status if discovery endpoint fails', async () => {
      const openrouter = new OpenRouterProvider('meta-llama/llama-3.3-70b-instruct', 'test-key');

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error on model list'));

      const discovery = await openrouter.listAvailableModels();
      expect(discovery.status).toBe('fallback_unverified');
      expect(discovery.models).toHaveLength(1);
      expect(discovery.models[0].id).toBe('meta-llama/llama-3.3-70b-instruct');
      expect(discovery.models[0].isDefault).toBe(true);
      expect(discovery.error).toContain('Network error on model list');
    });
  });
});
