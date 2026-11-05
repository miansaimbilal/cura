import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIFailoverEngine } from '../../src/modules/ai/failover';
import { AIProviderRegistry } from '../../src/modules/ai/registry';
import { AIProviderError } from '../../src/modules/ai/errors';
import type { AIModuleConfig } from '../../src/modules/ai/config';
import type { AITextRequest } from '../../src/modules/ai/types';

describe('Interactive AI Request Behavior (Strict Single-Provider Mode)', () => {
  const originalFetch = globalThis.fetch;

  const mockConfig: AIModuleConfig = {
    defaultProvider: 'gemini',
    defaultTimeoutMs: 10000,
    failoverOrder: ['gemini', 'groq', 'openrouter', 'cloudflare', 'xai'],
    providers: {
      gemini: { apiKey: 'key-gemini', defaultModel: 'gemini-3.8-flash' },
      groq: { apiKey: 'key-groq', defaultModel: 'llama-3.3-70b-versatile' },
      openrouter: { apiKey: 'key-openrouter', defaultModel: 'meta-llama/llama-3.3-70b-instruct' },
      cloudflare: { apiKey: 'cf-token', accountId: 'cf-acc', defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      xai: { apiKey: 'key-xai', defaultModel: 'grok-3-latest' },
    },
  };

  const interactiveRequest: AITextRequest = {
    messages: [
      { role: 'system', content: 'You are a warm, supportive companion.' },
      { role: 'user', content: 'I am struggling with my tasks today.' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('routes to explicitly selected provider', async () => {
    const registry = new AIProviderRegistry(mockConfig);
    const engine = new AIFailoverEngine(registry);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      expect(url).toContain('api.groq.com');
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Break it down into one small task.' } }],
          }),
      };
    });

    const result = await engine.executeInteractive(interactiveRequest, 'groq');

    expect(result.provider).toBe('groq');
    expect(result.text).toBe('Break it down into one small task.');
  });

  it('falls back to default provider if no provider is explicitly specified', async () => {
    const registry = new AIProviderRegistry(mockConfig);
    const engine = new AIFailoverEngine(registry);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      expect(url).toContain('generativelanguage.googleapis.com');
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Take a brief pause.' }] } }],
          }),
      };
    });

    const result = await engine.executeInteractive(interactiveRequest);

    expect(result.provider).toBe('gemini');
    expect(result.text).toBe('Take a brief pause.');
  });

  it('does NOT silently fall back when provider encounters a 429 rate limit', async () => {
    const registry = new AIProviderRegistry(mockConfig);
    const engine = new AIFailoverEngine(registry);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        status: 429,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'Rate limit reached: Please slow down.',
              type: 'tokens',
              code: 'rate_limit_exceeded',
            },
          }),
      };
    });

    try {
      await engine.executeInteractive(interactiveRequest, 'groq');
      expect.fail('Should have thrown AIProviderError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      const aiError = err as AIProviderError;
      expect(aiError.category).toBe('RATE_LIMITED');
      expect(aiError.provider).toBe('groq');
      expect(aiError.statusCode).toBe(429);
      // Critical check: Exactly 1 call was made; no silent failover occurred!
      expect(callCount).toBe(1);
    }
  });

  it('does NOT silently fall back on quota exhaustion', async () => {
    const registry = new AIProviderRegistry(mockConfig);
    const engine = new AIFailoverEngine(registry);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        status: 429,
        text: async () =>
          JSON.stringify({
            error: {
              message: 'You exceeded your current quota, please check your plan and billing details.',
              code: 'insufficient_quota',
            },
          }),
      };
    });

    try {
      await engine.executeInteractive(interactiveRequest, 'openrouter');
      expect.fail('Should have thrown AIProviderError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      const aiError = err as AIProviderError;
      expect(aiError.category).toBe('QUOTA_EXCEEDED');
      expect(aiError.provider).toBe('openrouter');
      // No silent failover
      expect(callCount).toBe(1);
    }
  });
});
