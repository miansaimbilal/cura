import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import { AppError } from '../src/middleware/errorHandler';
import { env } from '../src/config/env';

// Mock the DB connection check
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

describe('Authentication Module (AuthService & Routes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user, hash password, and return tokens', async () => {
      const mockUser = {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'newuser@cura.app',
        displayName: 'Cura User',
        timezone: 'America/New_York',
        createdAt: new Date(),
      };

      vi.spyOn(AuthService, 'register').mockResolvedValueOnce({
        user: mockUser,
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: '15m',
        },
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@cura.app',
          password: 'Password123!',
          displayName: 'Cura User',
          timezone: 'America/New_York',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('newuser@cura.app');
      expect(res.body.data.tokens.accessToken).toBe('mock-access-token');
      expect(res.body.data.tokens.refreshToken).toBe('mock-refresh-token');
    });

    it('should return 409 when email already exists', async () => {
      vi.spyOn(AuthService, 'register').mockRejectedValueOnce(
        new AppError(409, 'EMAIL_EXISTS', 'An account with this email address already exists')
      );

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@cura.app',
          password: 'Password123!',
        });

      // Zod passes, but service throws 409
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate valid credentials and return tokens', async () => {
      vi.spyOn(AuthService, 'login').mockResolvedValueOnce({
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'user@cura.app',
          displayName: 'Test',
          timezone: 'UTC',
          createdAt: new Date(),
        },
        tokens: {
          accessToken: 'valid-access-token',
          refreshToken: 'valid-refresh-token',
          expiresIn: '15m',
        },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@cura.app',
          password: 'correctPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBe('valid-access-token');
    });

    it('should return 401 on invalid credentials', async () => {
      vi.spyOn(AuthService, 'login').mockRejectedValueOnce(
        new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@cura.app',
          password: 'wrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should issue new access & refresh tokens on valid refresh token', async () => {
      vi.spyOn(AuthService, 'refreshToken').mockResolvedValueOnce({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: '15m',
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('new-access-token');
      expect(res.body.data.refreshToken).toBe('new-refresh-token');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should return user profile and preferences when authenticated', async () => {
      // Create a valid signed token for the test
      const validToken = jwt.sign(
        { userId: '22222222-2222-2222-2222-222222222222', email: 'test@cura.app', type: 'access' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      vi.spyOn(AuthService, 'getCurrentUser').mockResolvedValueOnce({
        user: {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'test@cura.app',
          displayName: 'Authenticated User',
          timezone: 'UTC',
          createdAt: new Date(),
        },
        preferences: {
          userId: '22222222-2222-2222-2222-222222222222',
          themeMode: 'dark',
          selectedChatProvider: 'gemini',
          selectedChatModel: 'gemini-1.5-flash',
          selectedCountry: 'US',
          aiIncludeTasks: true,
          aiIncludeMoods: true,
          notifyTimedTasks: true,
          notifyEodTasks: true,
          notifyMorningCheckin: true,
          notifyEveningCheckin: true,
          notifyAccomplishments: true,
          notifyAiInsights: true,
          morningCheckinTime: '08:30:00',
          eveningCheckinTime: '20:30:00',
          eodReminderTime: '21:00:00',
          quietHoursStart: null,
          quietHoursEnd: null,
          serverRevision: 1,
          serverUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test@cura.app');
      expect(res.body.data.preferences.themeMode).toBe('dark');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should succeed and revoke refresh token', async () => {
      vi.spyOn(AuthService, 'logout').mockResolvedValueOnce({ success: true });

      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });
  });
});
