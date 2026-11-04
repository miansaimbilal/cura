import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

// Mock DB connection check for isolated testing
vi.mock('../src/db/index', () => ({
  db: {},
  pool: { connect: vi.fn(), query: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe('Health Check Endpoint (GET /api/health)', () => {
  it('should return 200 with status ok and uptime', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('status', 'ok');
    expect(res.body.data).toHaveProperty('uptime');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.data).toHaveProperty('timestamp');
    expect(res.body.data).toHaveProperty('database', 'connected');
  });

  it('should return 404 for unknown endpoints with consistent error shape', async () => {
    const res = await request(app).get('/api/unknown-endpoint-xyz');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found',
      },
    });
  });
});
