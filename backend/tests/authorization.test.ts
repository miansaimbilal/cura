import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { env } from '../src/config/env';

vi.mock('../src/db/index', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { connect: vi.fn(), query: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe('Authorization Boundaries & Token Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject refresh tokens used as access tokens in Authorization header', async () => {
    // Generate a token with type: 'refresh'
    const refreshToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111', email: 'user@cura.app', type: 'refresh' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect(res.body.error.message).toContain('not a valid access token');
  });

  it('should reject expired access tokens with TOKEN_EXPIRED', async () => {
    // Generate an already-expired token
    const expiredToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111', email: 'user@cura.app', type: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: -1 } // expired 1 second ago
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('should reject tokens signed with a different secret', async () => {
    const invalidSignatureToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111', email: 'user@cura.app', type: 'access' },
      'wrong_secret_key_1234567890abcdef'
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${invalidSignatureToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('should reject requests with missing Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
