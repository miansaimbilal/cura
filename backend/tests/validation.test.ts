import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { env } from '../src/config/env';

vi.mock('../src/db/index', () => ({
  db: {},
  pool: { connect: vi.fn(), query: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));

describe('API Input Validation (Zod Middleware)', () => {
  it('should reject registration with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email-address',
        password: 'securePassword123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'body.email',
          message: 'Invalid email address',
        }),
      ])
    );
  });

  it('should reject registration with password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@cura.app',
        password: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'body.password',
          message: 'Password must be at least 8 characters long',
        }),
      ])
    );
  });

  it('should reject login without password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@cura.app',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject token refresh without refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject migrate-batch without batchId or with invalid task UUID', async () => {
    const validToken = jwt.sign(
      { userId: '11111111-1111-1111-1111-111111111111', email: 'user@cura.app', type: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app)
      .post('/api/auth/migrate-batch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        entities: {
          tasks: [
            {
              id: 'not-a-valid-uuid',
              title: 'Invalid Task',
            },
          ],
        },
      });

    // Zod validation should catch the missing batchId and invalid UUID
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
