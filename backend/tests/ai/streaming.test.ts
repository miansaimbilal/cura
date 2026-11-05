import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIWorkloadRouter } from '../../src/modules/ai/router';
import { AIProviderRegistry } from '../../src/modules/ai/registry';
import { AIProviderError } from '../../src/modules/ai/errors';
import { BaseAIProvider } from '../../src/modules/ai/adapters/base.adapter';
import { CredentialPool } from '../../src/modules/ai/credentialPool';
import type {
  AIProviderCapabilities,
  AIProviderCredential,
  AITextRequest,
  AITextResponse,
} from '../../src/modules/ai/types';

class MockStreamProvider extends BaseAIProvider {
  public doGenerateText = vi.fn();
  public streamTextMock = vi.fn();

  constructor(id: any = 'groq', credentials?: AIProviderCredential[]) {
    super(id, 'default-model-x', credentials || [{ id: 'key-1', apiKey: 'sk-1', enabled: true }]);
  }

  public getCapabilities(): AIProviderCapabilities {
    return {
      streaming: true,
      toolCalling: false,
      systemInstruction: true,
    };
  }

  protected async doStreamText(
    request: AITextRequest,
    credential: AIProviderCredential,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AITextResponse> {
    return this.streamTextMock(request, credential, onChunk, signal);
  }
}

describe('AI Workload Streaming & Credential Lifecycle (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockConfig: any = {
    defaultProvider: 'groq',
    defaultTimeoutMs: 10000,
    failoverOrder: ['groq', 'openrouter', 'gemini', 'cloudflare'],
    workloads: {
      chat: {
        allowedProviders: ['groq', 'openrouter'],
        defaultProvider: 'groq',
        defaultModel: 'default-model-x',
        fallbackProviders: [],
      },
      analytics: {
        allowedProviders: ['gemini', 'openrouter', 'cloudflare'],
        defaultProvider: 'gemini',
        defaultModel: 'default-model-x',
        fallbackProviders: ['openrouter', 'cloudflare'],
      },
    },
    providers: {
      gemini: { apiKey: 'key-gemini', credentials: [{ id: 'k1', apiKey: 'sk-1', enabled: true }] },
      groq: { apiKey: 'key-groq', credentials: [{ id: 'k2', apiKey: 'sk-2', enabled: true }] },
      openrouter: { apiKey: 'key-openrouter', credentials: [{ id: 'k3', apiKey: 'sk-3', enabled: true }] },
      cloudflare: { apiKey: 'cf-token', accountId: 'cf-acc', credentials: [{ id: 'k4', apiKey: 'sk-4', enabled: true }] },
      xai: { apiKey: 'key-xai', credentials: [{ id: 'k5', apiKey: 'sk-5', enabled: true }] },
    },
  };

  describe('executeChatStream on AIWorkloadRouter', () => {
    it('executes streaming and yields chunks to callback', async () => {
      const provider = new MockStreamProvider('groq');
      provider.streamTextMock.mockImplementationOnce(
        async (_req, _cred, onChunk) => {
          onChunk('Hello ');
          onChunk('world');
          return {
            text: 'Hello world',
            provider: 'groq',
            model: 'default-model-x',
            latencyMs: 10,
          };
        }
      );

      const registry = new AIProviderRegistry(mockConfig);
      vi.spyOn(registry, 'getProvider').mockReturnValue(provider);

      const router = new AIWorkloadRouter(registry);
      const emitted: string[] = [];

      const result = await router.executeChatStream(
        { messages: [{ role: 'user', content: 'Hi' }] },
        (c) => emitted.push(c)
      );

      expect(emitted).toEqual(['Hello ', 'world']);
      expect(result.text).toBe('Hello world');
      expect(result.provider).toBe('groq');
    });

    it('rejects disallowed providers (e.g. gemini) with UNSUPPORTED_CAPABILITY', async () => {
      const registry = new AIProviderRegistry(mockConfig);
      const router = new AIWorkloadRouter(registry);

      await expect(
        router.executeChatStream(
          { messages: [{ role: 'user', content: 'Hi' }] },
          vi.fn(),
          { provider: 'gemini' }
        )
      ).rejects.toThrow(AIProviderError);
    });

    it('rotates credential within selected provider when key 1 gets 429 rate limited', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'key-1', apiKey: 'sk-1', enabled: true },
        { id: 'key-2', apiKey: 'sk-2', enabled: true },
      ]);

      const provider = new MockStreamProvider('groq');
      // Replace provider's pool with multi-key pool
      (provider as any).pool = pool;

      // First key fails with 429 RATE_LIMITED, second key succeeds
      provider.streamTextMock
        .mockRejectedValueOnce(
          new AIProviderError({
            category: 'RATE_LIMITED',
            provider: 'groq',
            message: 'Rate limit on key 1',
            isRetryable: true,
          })
        )
        .mockImplementationOnce(async (_req, cred, onChunk) => {
          expect(cred.id).toBe('key-2');
          onChunk('Recovered on key 2');
          return {
            text: 'Recovered on key 2',
            provider: 'groq',
            model: 'default-model-x',
            latencyMs: 15,
          };
        });

      const chunks: string[] = [];
      const result = await provider.streamText(
        { messages: [{ role: 'user', content: 'Hello' }], model: 'default-model-x' },
        (c) => chunks.push(c)
      );

      expect(chunks).toEqual(['Recovered on key 2']);
      expect(result.text).toBe('Recovered on key 2');
      // key-1 should now be in cooldown
      expect(pool.getStats().coolingDown).toBe(1);
    });

    it('cancels cleanly on client AbortSignal without penalizing credentials as failed', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'key-1', apiKey: 'sk-1', enabled: true },
      ]);

      const provider = new MockStreamProvider('groq');
      (provider as any).pool = pool;

      const abortController = new AbortController();
      abortController.abort(); // already cancelled

      await expect(
        provider.streamText(
          { messages: [{ role: 'user', content: 'Hello' }], model: 'default-model-x' },
          vi.fn(),
          abortController.signal
        )
      ).rejects.toThrow(AIProviderError);

      // Key should NOT be in cooldown or quarantined
      expect(pool.getStats().coolingDown).toBe(0);
      expect(pool.getStats().quarantined).toBe(0);
    });
  });
});
