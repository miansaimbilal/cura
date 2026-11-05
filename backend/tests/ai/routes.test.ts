import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

// Mock DB connection check
vi.mock('../../src/db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { connect: vi.fn(), query: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe('AI Observability & Diagnostics Routes (GET /api/ai/status)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/ai/status');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns provider health overview for authenticated users without leaking secrets', async () => {
    const validToken = jwt.sign(
      { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app)
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('defaultProvider');
    expect(res.body.data).toHaveProperty('failoverOrder');
    expect(Array.isArray(res.body.data.providers)).toBe(true);
    expect(res.body.data.providers.length).toBe(5);

    for (const p of res.body.data.providers) {
      expect(p).toHaveProperty('provider');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('isConfigured');
      expect(p).toHaveProperty('isAvailable');
      expect(p).toHaveProperty('defaultModel');

      // Security check: API keys, tokens, and secrets must NEVER be present
      expect(p).not.toHaveProperty('apiKey');
      expect(p).not.toHaveProperty('token');
      expect(p).not.toHaveProperty('secret');
      expect(p).not.toHaveProperty('CLOUDFLARE_API_TOKEN');
      expect(p).not.toHaveProperty('GEMINI_API_KEY');
      expect(p).toHaveProperty('credentials');
      expect(p.credentials).toHaveProperty('total');
      expect(p.credentials).toHaveProperty('active');
    }

    expect(res.body.data).toHaveProperty('workloads');
    expect(res.body.data.workloads).toHaveProperty('chat');
    expect(res.body.data.workloads).toHaveProperty('analytics');
    expect(res.body.data.workloads.chat.allowedProviders).toEqual(['groq', 'openrouter']);
    expect(res.body.data.workloads.analytics.allowedProviders).toEqual(['gemini', 'openrouter', 'cloudflare']);
  });

  describe('Model Discovery Route (GET /api/ai/models)', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/ai/models');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when an invalid provider is queried', async () => {
      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/ai/models?provider=invalid-provider-xyz')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('returns model list for a valid provider without exposing secrets', async () => {
      const { getAIRegistry } = await import('../../src/modules/ai/registry');
      const registry = getAIRegistry();
      const groq = registry.getProvider('groq');
      groq.getCredentialPool().addCredential({
        id: 'groq_test_key',
        apiKey: 'gsk-test-token',
        enabled: true,
      });

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

      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/ai/models?provider=groq&refresh=true')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('groq');
      expect(res.body.data.status).toBe('discovered');
      expect(Array.isArray(res.body.data.models)).toBe(true);
      expect(res.body.data.models.length).toBeGreaterThan(0);

      for (const m of res.body.data.models) {
        expect(m).toHaveProperty('id');
        expect(m).toHaveProperty('provider', 'groq');
        expect(m).not.toHaveProperty('apiKey');
        expect(m).not.toHaveProperty('token');
      }
    });

    it('rejects invalid workload with 400', async () => {
      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/ai/models?workload=invalid_workload_name')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('rejects unpermitted provider for specified workload with 400', async () => {
      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      // Gemini is not allowed for chat
      const res = await request(app)
        .get('/api/ai/models?workload=chat&provider=gemini')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNSUPPORTED_CAPABILITY');
    });

    it('returns filtered models when valid workload is specified', async () => {
      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'tester@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/ai/models?workload=chat&provider=groq')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workload).toBe('chat');
      expect(res.body.data.provider).toBe('groq');
    });
  });
});
