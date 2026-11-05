import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CredentialPool } from '../../src/modules/ai/credentialPool';
import { GroqProvider } from '../../src/modules/ai/adapters/groq.adapter';
import { GeminiProvider } from '../../src/modules/ai/adapters/gemini.adapter';
import { CloudflareProvider } from '../../src/modules/ai/adapters/cloudflare.adapter';
import { AIProviderError } from '../../src/modules/ai/errors';
import type { AIProviderCredential, AITextRequest } from '../../src/modules/ai/types';

describe('AI Multi-Key Credential Infrastructure & Intelligent Rotation', () => {
  const originalFetch = globalThis.fetch;

  const testRequest: AITextRequest = {
    messages: [{ role: 'user', content: 'Organize my morning plan' }],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('CredentialPool Unit Behavior', () => {
    it('manages multiple credentials and balances requests across available keys', () => {
      const keys: AIProviderCredential[] = [
        { id: 'key_1', apiKey: 'gsk_key1', enabled: true },
        { id: 'key_2', apiKey: 'gsk_key2', enabled: true },
      ];
      const pool = new CredentialPool('groq', keys);

      expect(pool.isConfigured()).toBe(true);
      expect(pool.hasAvailable()).toBe(true);

      const firstPick = pool.getEligibleCredential();
      expect(firstPick?.id).toBe('key_1');

      const secondPick = pool.getEligibleCredential();
      expect(secondPick?.id).toBe('key_2');

      const stats = pool.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.coolingDown).toBe(0);
      expect(stats.quarantined).toBe(0);
    });

    it('places rate-limited keys in cooldown respecting Retry-After and skips them', () => {
      const keys: AIProviderCredential[] = [
        { id: 'key_a', apiKey: 'gsk_a', enabled: true },
        { id: 'key_b', apiKey: 'gsk_b', enabled: true },
      ];
      const pool = new CredentialPool('groq', keys);

      // Mark key_a rate limited with 45s Retry-After
      pool.markRateLimited('key_a', 45);

      const stats = pool.getStats();
      expect(stats.active).toBe(1);
      expect(stats.coolingDown).toBe(1);

      // Next eligible key must be key_b
      const pick = pool.getEligibleCredential();
      expect(pick?.id).toBe('key_b');
    });

    it('quarantines invalid credentials so they are disabled permanently', () => {
      const keys: AIProviderCredential[] = [
        { id: 'bad_key', apiKey: 'invalid_secret', enabled: true },
        { id: 'good_key', apiKey: 'valid_secret', enabled: true },
      ];
      const pool = new CredentialPool('groq', keys);

      pool.quarantine('bad_key', 'Invalid API Key provided (401)');

      const stats = pool.getStats();
      expect(stats.quarantined).toBe(1);
      expect(stats.active).toBe(1);

      const pick1 = pool.getEligibleCredential();
      expect(pick1?.id).toBe('good_key');

      // Subsequent picks only return good_key
      const pick2 = pool.getEligibleCredential();
      expect(pick2?.id).toBe('good_key');
    });

    it('summarizes credentials without leaking raw secrets', () => {
      const keys: AIProviderCredential[] = [
        { id: 'secret_key_1', apiKey: 'super_secret_token_12345', enabled: true },
      ];
      const pool = new CredentialPool('gemini', keys);
      const summaries = pool.getCredentialSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('secret_key_1');
      expect(summaries[0].enabled).toBe(true);
      expect(summaries[0].isAvailable).toBe(true);
      expect(JSON.stringify(summaries)).not.toContain('super_secret_token_12345');
    });
  });

  describe('Provider Adapter Multi-Key Integration & Key Rotation', () => {
    it('rotates to next credential upon receiving 429 rate limit from provider', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'key_primary', apiKey: 'gsk_key_primary', enabled: true },
        { id: 'key_backup', apiKey: 'gsk_key_backup', enabled: true },
      ]);
      const provider = new GroqProvider('llama-3.3-70b-versatile', pool);

      const attemptedHeaders: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const auth = opts.headers?.Authorization as string;
        attemptedHeaders.push(auth);

        if (auth.includes('gsk_key_primary')) {
          // Primary key hits rate limit
          return {
            status: 429,
            headers: new Headers({ 'retry-after': '30' }),
            text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
          };
        }

        // Backup key succeeds
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Plan created successfully!' } }],
              usage: { total_tokens: 30 },
            }),
        };
      });

      const response = await provider.generateText(testRequest);

      expect(response.text).toBe('Plan created successfully!');
      expect(attemptedHeaders).toEqual(['Bearer gsk_key_primary', 'Bearer gsk_key_backup']);

      const stats = provider.getCredentialStats();
      expect(stats.coolingDown).toBe(1); // key_primary in cooldown
      expect(stats.active).toBe(1); // key_backup active
    });

    it('rotates to next credential upon 403 quota exhaustion', async () => {
      const pool = new CredentialPool('gemini', [
        { id: 'gem_acc_1', apiKey: 'key_acc_1', enabled: true },
        { id: 'gem_acc_2', apiKey: 'key_acc_2', enabled: true },
      ]);
      const provider = new GeminiProvider('gemini-3.8-flash', pool);

      const attemptedKeys: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const key = opts.headers?.['x-goog-api-key'] as string;
        attemptedKeys.push(key);

        if (key === 'key_acc_1') {
          return {
            status: 429,
            headers: new Headers(),
            text: async () =>
              JSON.stringify({
                error: { message: 'Resource has been exhausted (quota exceeded)' },
              }),
          };
        }

        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Here are your analytics.' }] } }],
            }),
        };
      });

      const res = await provider.generateText(testRequest);
      expect(res.text).toBe('Here are your analytics.');
      expect(attemptedKeys).toEqual(['key_acc_1', 'key_acc_2']);
    });

    it('quarantines invalid credentials upon 401 unauthorized and rotates to valid key', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'expired_key', apiKey: 'gsk_expired', enabled: true },
        { id: 'fresh_key', apiKey: 'gsk_fresh', enabled: true },
      ]);
      const provider = new GroqProvider('llama-3.3-70b-versatile', pool);

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const auth = opts.headers?.Authorization as string;
        if (auth.includes('gsk_expired')) {
          return {
            status: 401,
            headers: new Headers(),
            text: async () =>
              JSON.stringify({ error: { message: 'Invalid API Key provided' } }),
          };
        }
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Success with fresh key' } }],
            }),
        };
      });

      const res = await provider.generateText(testRequest);
      expect(res.text).toBe('Success with fresh key');

      const stats = provider.getCredentialStats();
      expect(stats.quarantined).toBe(1); // expired_key quarantined
      expect(stats.active).toBe(1); // fresh_key active
    });

    it('does NOT rotate credentials on 404 (MODEL_UNAVAILABLE) or 400 (INVALID_REQUEST)', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'key1', enabled: true },
        { id: 'k2', apiKey: 'key2', enabled: true },
      ]);
      const provider = new GroqProvider('llama-3.3-70b-versatile', pool);

      let fetchCallCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return {
          status: 404,
          headers: new Headers(),
          text: async () => JSON.stringify({ error: { message: 'Model nonexistent not found' } }),
        };
      });

      await expect(
        provider.generateText({ ...testRequest, model: 'nonexistent-model' })
      ).rejects.toThrow();

      // Exactly 1 call was made; key rotation was NOT triggered for a nonexistent model!
      expect(fetchCallCount).toBe(1);
    });

    it('does NOT rotate credentials on 403 model permission/access error', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'key1', enabled: true },
        { id: 'k2', apiKey: 'key2', enabled: true },
      ]);
      const provider = new GroqProvider('restricted-model', pool);

      let fetchCallCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return {
          status: 403,
          headers: new Headers(),
          text: async () => JSON.stringify({ error: { message: 'model_not_allowed for this organization' } }),
        };
      });

      await expect(provider.generateText(testRequest)).rejects.toThrow();
      expect(fetchCallCount).toBe(1); // Halts immediately; does not waste k2
    });

    it('does NOT rotate credentials on general 403 forbidden error', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'key1', enabled: true },
        { id: 'k2', apiKey: 'key2', enabled: true },
      ]);
      const provider = new GroqProvider('any-model', pool);

      let fetchCallCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        return {
          status: 403,
          headers: new Headers(),
          text: async () => JSON.stringify({ error: { message: 'Forbidden: IP address not allowed' } }),
        };
      });

      await expect(provider.generateText(testRequest)).rejects.toThrow();
      expect(fetchCallCount).toBe(1); // Halts immediately; does not rotate
    });

    it('rotates to next credential on 403 account usage restriction', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'key1', enabled: true },
        { id: 'k2', apiKey: 'key2', enabled: true },
      ]);
      const provider = new GroqProvider('any-model', pool);

      let attemptedKey: string | undefined;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const auth = opts.headers?.Authorization as string;
        if (auth.includes('key1')) {
          return {
            status: 403,
            headers: new Headers(),
            text: async () => JSON.stringify({ error: { message: 'Account is tier_restricted in this region' } }),
          };
        }
        attemptedKey = 'key2';
        return {
          status: 200,
          headers: new Headers(),
          text: async () => JSON.stringify({ choices: [{ message: { content: 'Key 2 worked' } }] }),
        };
      });

      const res = await provider.generateText(testRequest);
      expect(res.text).toBe('Key 2 worked');
      expect(attemptedKey).toBe('key2');
    });

    it('distinguishes live-discovered models from cached models and unverified entries', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'valid_key', enabled: true },
      ]);
      const provider = new GroqProvider(undefined, pool);

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            data: [
              { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
              { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
            ],
          }),
      });

      // 1. First discovery call is live ('discovered')
      const liveDiscovery = await provider.listAvailableModels();
      expect(liveDiscovery.status).toBe('discovered');
      expect(liveDiscovery.models).toHaveLength(2);

      // 2. Immediate second call is served from cache ('cached')
      const cachedDiscovery = await provider.listAvailableModels();
      expect(cachedDiscovery.status).toBe('cached');
      expect(cachedDiscovery.models).toHaveLength(2);

      // 3. Forced refresh triggers live call again ('discovered')
      const forceDiscovery = await provider.listAvailableModels(true);
      expect(forceDiscovery.status).toBe('discovered');

      // 4. Unconfigured provider returns 'fallback_unverified'
      const unconfiguredProvider = new GroqProvider(undefined, new CredentialPool('groq', []));
      const unconfiguredDiscovery = await unconfiguredProvider.listAvailableModels();
      expect(unconfiguredDiscovery.status).toBe('fallback_unverified');
    });

    it('supports Cloudflare account-specific credentials in pool', async () => {
      const pool = new CredentialPool('cloudflare', [
        { id: 'cf_account_a', apiKey: 'token_a', accountId: 'acc_id_a', enabled: true },
        { id: 'cf_account_b', apiKey: 'token_b', accountId: 'acc_id_b', enabled: true },
      ]);
      const provider = new CloudflareProvider('@cf/meta/llama-3.3-70b-instruct-fp8-fast', pool);

      const capturedUrls: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrls.push(url);
        if (url.includes('acc_id_a')) {
          // Account A rate limited
          return {
            status: 429,
            headers: new Headers(),
            text: async () => JSON.stringify({ success: false, errors: [{ message: 'Rate limited' }] }),
          };
        }
        // Account B succeeds
        return {
          status: 200,
          headers: new Headers(),
          text: async () =>
            JSON.stringify({
              success: true,
              result: { response: 'Cloudflare account B responded' },
            }),
        };
      });

      const res = await provider.generateText(testRequest);
      expect(res.text).toBe('Cloudflare account B responded');
      expect(capturedUrls[0]).toContain('acc_id_a');
      expect(capturedUrls[1]).toContain('acc_id_b');
    });

    it('throws when all credentials in pool are exhausted', async () => {
      const pool = new CredentialPool('groq', [
        { id: 'k1', apiKey: 'key1', enabled: true },
        { id: 'k2', apiKey: 'key2', enabled: true },
      ]);
      const provider = new GroqProvider('llama-3.3-70b-versatile', pool);

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 429,
        headers: new Headers({ 'retry-after': '60' }),
        text: async () => JSON.stringify({ error: { message: 'Rate limit hit' } }),
      });

      await expect(provider.generateText(testRequest)).rejects.toThrow(
        /All 2 configured credentials for provider "Groq" failed/
      );

      const stats = provider.getCredentialStats();
      expect(stats.active).toBe(0);
      expect(stats.coolingDown).toBe(2);
    });
  });
});
