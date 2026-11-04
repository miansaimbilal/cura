import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
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

describe('Idempotent Guest Migration (POST /api/auth/migrate-batch)', () => {
  const userId = '33333333-3333-3333-3333-333333333333';
  let validToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    validToken = jwt.sign(
      { userId, email: 'guest.migrated@cura.app', type: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
  });

  it('should reject unauthenticated migration attempts with 401', async () => {
    const res = await request(app)
      .post('/api/auth/migrate-batch')
      .send({
        batchId: 'batch-001',
        clientMutationIds: ['mut-1'],
        entities: { tasks: [], moodEntries: [] },
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should successfully process a guest migration batch', async () => {
    const batchId = 'batch-guest-101';
    const taskId1 = '44444444-4444-4444-4444-444444444444';
    const moodId1 = '55555555-5555-5555-5555-555555555555';

    vi.spyOn(AuthService, 'migrateBatch').mockResolvedValueOnce({
      batchId,
      status: 'completed',
      confirmedEntityIds: {
        tasks: [taskId1],
        moodEntries: [moodId1],
      },
      confirmedMutationIds: ['mut-guest-1', 'mut-guest-2'],
      processedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/migrate-batch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        batchId,
        clientMutationIds: ['mut-guest-1', 'mut-guest-2'],
        entities: {
          tasks: [
            {
              id: taskId1,
              title: 'Offline guest task',
              description: 'Created before registering',
              dueDate: '2026-11-05',
              isTimed: false,
              status: 'pending',
            },
          ],
          moodEntries: [
            {
              id: moodId1,
              moodType: 'calm',
              note: 'Guest mood check',
              tags: ['relax'],
              loggedAt: '2026-11-05T08:00:00.000Z',
            },
          ],
          userPreferences: {
            themeMode: 'dark',
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toBe(batchId);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.confirmedEntityIds.tasks).toContain(taskId1);
    expect(res.body.data.confirmedEntityIds.moodEntries).toContain(moodId1);
    expect(res.body.data.confirmedMutationIds).toEqual(['mut-guest-1', 'mut-guest-2']);
  });

  it('should be idempotent: duplicate batchId returns already_processed without error', async () => {
    const batchId = 'batch-guest-101';
    const taskId1 = '44444444-4444-4444-4444-444444444444';
    const moodId1 = '55555555-5555-5555-5555-555555555555';

    // Second call simulates server returning already_processed
    vi.spyOn(AuthService, 'migrateBatch').mockResolvedValueOnce({
      batchId,
      status: 'already_processed',
      confirmedEntityIds: {
        tasks: [taskId1],
        moodEntries: [moodId1],
      },
      confirmedMutationIds: ['mut-guest-1', 'mut-guest-2'],
      processedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/migrate-batch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        batchId,
        clientMutationIds: ['mut-guest-1', 'mut-guest-2'],
        entities: {
          tasks: [
            {
              id: taskId1,
              title: 'Offline guest task',
              dueDate: '2026-11-05',
              isTimed: false,
              status: 'pending',
            },
          ],
          moodEntries: [
            {
              id: moodId1,
              moodType: 'calm',
              tags: [],
              loggedAt: '2026-11-05T08:00:00.000Z',
            },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('already_processed');
    expect(res.body.data.confirmedEntityIds.tasks).toContain(taskId1);
  });
});
