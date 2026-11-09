import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask } from '../../src/db/taskRepository';
import { createMoodEntry } from '../../src/db/moodRepository';
import { getWidgetSnapshotMetadata } from '../../src/services/widgets/snapshotBuilder';
import { WidgetNativePublisher } from '../../src/services/widgets/publishOrchestrator';
import {
  loginUser,
  registerUser,
  logoutUser,
  getStoredTokens,
  storeTokens,
} from '../../src/services/auth/authContext';
import { migrateGuestDataToUser } from '../../src/services/auth/sessionService';

// In-memory SecureStore mock
const secureStorage = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStorage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStorage.set(key, String(value));
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStorage.delete(key);
  }),
}));

describe('Phase 9: Mobile Auth & Guest Migration Flow Integration Tests', () => {
  let db: NodeSQLiteAdapter;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    secureStorage.clear();
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Initial metadata state: guest, epoch 1, revisions at 0
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = 'guest', account_epoch = 1, source_revision = 0, published_revision = 0
       WHERE id = 1;`
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. Login success -> tokens stored in SecureStore, migrateGuestDataToUser called, epoch +1, snapshot published', async () => {
    // Seed 2 guest tasks and 1 guest mood
    const t1 = await createTask(db, { userId: 'guest', title: 'Buy groceries' });
    const t2 = await createTask(db, { userId: 'guest', title: 'Schedule dentist' });
    const m1 = await createMoodEntry(db, { userId: 'guest', moodType: 'happy' });

    const authUser = { id: 'usr_auth_001', email: 'alice@cura.app' };

    // Mock fetch for auth login + batch sync
    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'jwt_access_alice',
              refreshToken: 'jwt_refresh_alice',
              user: authUser,
            },
          }),
        } as Response;
      }
      if (urlStr.includes('/api/v1/auth/migrate-batch')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, count: 3 }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    const result = await loginUser('alice@cura.app', 'correctPassword123', {
      db,
      publisher,
      clearSnapshotsFn,
    });

    // 1. Assert return value
    expect(result.success).toBe(true);
    expect(result.user).toEqual(authUser);

    // 2. Assert SecureStore has tokens
    const { accessToken, refreshToken, user } = await getStoredTokens();
    expect(accessToken).toBe('jwt_access_alice');
    expect(refreshToken).toBe('jwt_refresh_alice');
    expect(user).toEqual(authUser);

    // 3. Assert guest data migrated to authUser in SQLite
    const guestTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = 'guest';`);
    expect(guestTasks).toHaveLength(0);

    const userTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, authUser.id);
    expect(userTasks).toHaveLength(2);
    const taskIds = userTasks.map((t: any) => t.id);
    expect(taskIds).toContain(t1.id);
    expect(taskIds).toContain(t2.id);

    const guestMoods = await db.getAllAsync(`SELECT id FROM mood_entries WHERE user_id = 'guest';`);
    expect(guestMoods).toHaveLength(0);

    const userMoods = await db.getAllAsync(`SELECT id FROM mood_entries WHERE user_id = ?;`, authUser.id);
    expect(userMoods).toHaveLength(1);
    expect((userMoods[0] as any).id).toBe(m1.id);

    // 4. Assert metadata epoch incremented
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.user_id).toBe(authUser.id);
    expect(meta.account_epoch).toBe(2);
    expect(meta.source_revision).toBe(meta.published_revision);

    // 5. Assert bridge operations called
    expect(clearSnapshotsFn).toHaveBeenCalledTimes(1);
    expect(publisher).toHaveBeenCalledTimes(1);
    expect(publisher.mock.calls[0][0].userId).toBe(authUser.id);
  });

  it('2. Login success + cloud migrate-batch fails (offline / 500) -> local migration committed, queued in sync_outbox, no data lost', async () => {
    // Seed 1 guest task
    const t1 = await createTask(db, { userId: 'guest', title: 'Prepare offline talk' });
    const authUser = { id: 'usr_auth_002', email: 'bob@cura.app' };

    // Mock fetch: login succeeds, batch-sync fails with 500 Internal Server Error
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'jwt_access_bob',
              refreshToken: 'jwt_refresh_bob',
              user: authUser,
            },
          }),
        } as Response;
      }
      if (urlStr.includes('/api/v1/auth/migrate-batch')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, error: 'Database connection failed' }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    const result = await loginUser('bob@cura.app', 'password123', {
      db,
      publisher,
      clearSnapshotsFn,
    });

    // Login still succeeds from client UX perspective
    expect(result.success).toBe(true);

    // Local migration is committed
    const userTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, authUser.id);
    expect(userTasks).toHaveLength(1);
    expect((userTasks[0] as any).id).toBe(t1.id);

    // Queued in sync_outbox so data is preserved for retry
    const outboxRows = await db.getAllAsync(
      `SELECT * FROM sync_outbox WHERE user_id = ? AND entity_type = 'batch_migration';`,
      authUser.id
    );
    expect(outboxRows).toHaveLength(1);
    const queued = outboxRows[0] as any;
    expect(queued.action).toBe('sync');
    expect(queued.entity_id).toBe(authUser.id);
  });

  it('3. Login failure (401) -> tokens NOT stored, migration NOT called, guest data untouched, error returned', async () => {
    // Seed 1 guest task
    await createTask(db, { userId: 'guest', title: 'Unmigrated guest task' });

    // Mock fetch: login returns 401 Unauthorized
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/login')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { message: 'Invalid credentials' },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    const result = await loginUser('alice@cura.app', 'wrongPassword', {
      db,
      publisher,
      clearSnapshotsFn,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid credentials|Invalid email or password/);

    // Tokens NOT stored in SecureStore
    const { accessToken, user } = await getStoredTokens();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();

    // Guest data untouched
    const guestTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = 'guest';`);
    expect(guestTasks).toHaveLength(1);

    // Metadata not advanced
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.user_id).toBe('guest');
    expect(meta.account_epoch).toBe(1);

    // Bridge functions NOT called
    expect(publisher).not.toHaveBeenCalled();
    expect(clearSnapshotsFn).not.toHaveBeenCalled();
  });

  it('4. Logout -> tokens deleted from SecureStore, epoch advanced to guest, user data retained in SQLite', async () => {
    const authUser = { id: 'usr_auth_logout', email: 'logout_test@cura.app' };

    // Pre-populate authenticated state: tokens in SecureStore + task in SQLite under user
    await storeTokens('access_tok_old', 'refresh_tok_old', authUser);
    await createTask(db, { userId: authUser.id, title: 'Alice private task' });

    // Metadata set to user, epoch 2
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?, account_epoch = 2, source_revision = 5, published_revision = 5
       WHERE id = 1;`,
      authUser.id
    );

    // Mock fetch: remote logout endpoint
    const logoutFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response));
    globalThis.fetch = logoutFetch;

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    await logoutUser({
      db,
      publisher,
      clearSnapshotsFn,
    });

    // 1. Tokens purged from SecureStore
    const { accessToken, refreshToken, user } = await getStoredTokens();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
    expect(user).toBeNull();

    // 2. Metadata reset to 'guest' and epoch incremented to 3
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.user_id).toBe('guest');
    expect(meta.account_epoch).toBe(3);
    expect(meta.source_revision).toBe(meta.published_revision);

    // 3. Old user's tasks are NOT deleted from SQLite (data retention preserved)
    const retainedTasks = await db.getAllAsync(`SELECT id, title FROM tasks WHERE user_id = ?;`, authUser.id);
    expect(retainedTasks).toHaveLength(1);
    expect((retainedTasks[0] as any).title).toBe('Alice private task');

    // 4. Snapshots cleared and publisher refreshed for guest
    expect(clearSnapshotsFn).toHaveBeenCalledTimes(1);
    expect(publisher).toHaveBeenCalledTimes(1);
    expect(publisher.mock.calls[0][0].userId).toBe('guest');
  });

  it('5. Register success -> creates user, stores tokens, runs guest migration, advances epoch', async () => {
    const t1 = await createTask(db, { userId: 'guest', title: 'Guest task before registration' });
    const newUser = { id: 'usr_reg_001', email: 'newbie@cura.app' };

    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/register')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'jwt_reg_access',
              refreshToken: 'jwt_reg_refresh',
              user: newUser,
            },
          }),
        } as Response;
      }
      if (urlStr.includes('/api/v1/auth/migrate-batch')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    const result = await registerUser('newbie@cura.app', 'securePassword99', {
      db,
      publisher,
      clearSnapshotsFn,
    });

    expect(result.success).toBe(true);
    expect(result.user).toEqual(newUser);

    // Tokens saved
    const { accessToken, user } = await getStoredTokens();
    expect(accessToken).toBe('jwt_reg_access');
    expect(user).toEqual(newUser);

    // Guest task transferred
    const migratedTasks = await db.getAllAsync(`SELECT id FROM tasks WHERE user_id = ?;`, newUser.id);
    expect(migratedTasks).toHaveLength(1);
    expect((migratedTasks[0] as any).id).toBe(t1.id);

    // Epoch advanced
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.user_id).toBe(newUser.id);
    expect(meta.account_epoch).toBe(2);
  });

  it('6. Option B processed_actions rule: guest receipts remain intact under guest, zero UPDATE attempted, no trigger abort', async () => {
    // 1. Insert action receipt under guest
    const guestActionId = 'act_prev_guest_1';
    await db.runAsync(
      `INSERT INTO processed_actions (action_id, user_id, action_type, target_id, requested_state, applied_state, status, payload_hash, client_action_time)
       VALUES (?, 'guest', 'task_toggle', 'task_1', 'completed', 'completed', 'applied', 'hash123', datetime('now'));`,
      guestActionId
    );

    // Verify row is present
    const prevAction = await db.getFirstAsync<any>(
      `SELECT action_id, user_id FROM processed_actions WHERE action_id = ?;`,
      guestActionId
    );
    expect(prevAction).not.toBeNull();
    expect(prevAction?.user_id).toBe('guest');

    // 2. Perform guest migration
    const newUserId = 'usr_option_b_tester';
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);

    // Must NOT throw SQLite RAISE(ABORT, 'processed_actions rows are immutable...')
    await expect(
      migrateGuestDataToUser(db, newUserId, {
        publisher,
        clearSnapshotsFn,
      })
    ).resolves.not.toThrow();

    // 3. Verify receipt remains strictly intact under 'guest'
    const afterAction = await db.getFirstAsync<any>(
      `SELECT action_id, user_id FROM processed_actions WHERE action_id = ?;`,
      guestActionId
    );
    expect(afterAction).not.toBeNull();
    expect(afterAction?.user_id).toBe('guest');

    // 4. Verify authenticated user can insert new action receipts without any conflict
    const authActionId = 'act_auth_fresh_1';
    await db.runAsync(
      `INSERT INTO processed_actions (action_id, user_id, action_type, target_id, requested_state, applied_state, status, payload_hash, client_action_time)
       VALUES (?, ?, 'mood_log', 'mood_1', 'happy', 'happy', 'applied', 'hash456', datetime('now'));`,
      authActionId,
      newUserId
    );

    const insertedAuthAction = await db.getFirstAsync<any>(
      `SELECT action_id, user_id FROM processed_actions WHERE action_id = ?;`,
      authActionId
    );
    expect(insertedAuthAction?.user_id).toBe(newUserId);
  });
});
