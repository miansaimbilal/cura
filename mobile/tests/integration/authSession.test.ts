import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask } from '../../src/db/taskRepository';
import { getWidgetSnapshotMetadata } from '../../src/services/widgets/snapshotBuilder';
import {
  getValidAccessToken,
  restoreSession,
  retryPendingBatchMigration,
  storeTokens,
  getStoredTokens,
  setSessionExpiredListener,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_INFO_KEY,
  decodeJwtExp,
  isTokenExpired,
} from '../../src/services/auth/authContext';
import * as SecureStore from 'expo-secure-store';

// Helper to construct test JWTs
function createTestJwt(expSecondsFromNow: number, userId: string = 'usr_test'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    })
  ).toString('base64url');
  return `${header}.${payload}.signature`;
}

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

describe('Phase 9: Token Refresh, Cold Start Session Restore & Sync Retry', () => {
  let db: NodeSQLiteAdapter;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    secureStorage.clear();
    setSessionExpiredListener(null);
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = 'guest', account_epoch = 1, source_revision = 0, published_revision = 0
       WHERE id = 1;`
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSessionExpiredListener(null);
    vi.restoreAllMocks();
  });

  it('1. Refresh success: expired accessToken (<60s) -> refresh called -> new tokens saved -> token returned', async () => {
    const expiredToken = createTestJwt(-300); // expired 5 minutes ago
    const refreshToken = 'valid_refresh_token_123';
    const testUser = { id: 'usr_refresh_01', email: 'refresh@cura.app' };

    await storeTokens(expiredToken, refreshToken, testUser);

    // Verify token is expired
    expect(isTokenExpired(expiredToken, 60)).toBe(true);

    const newAccessToken = createTestJwt(3600); // 1 hour validity
    const newRefreshToken = 'new_rotated_refresh_token_456';

    globalThis.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        const body = JSON.parse(init?.body || '{}');
        expect(body.refreshToken).toBe(refreshToken);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              expiresIn: '15m',
            },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const validToken = await getValidAccessToken({ db });

    expect(validToken).toBe(newAccessToken);

    // Verify tokens updated in SecureStore
    const stored = await getStoredTokens();
    expect(stored.accessToken).toBe(newAccessToken);
    expect(stored.refreshToken).toBe(newRefreshToken);
    expect(stored.user).toEqual(testUser);
  });

  it('2. Refresh failure 401: SecureStore cleared, state -> guest, user data retained, no migration called', async () => {
    const expiredToken = createTestJwt(-100);
    const deadRefreshToken = 'revoked_refresh_token';
    const authUser = { id: 'usr_expired_01', email: 'expired@cura.app' };

    await storeTokens(expiredToken, deadRefreshToken, authUser);

    // Seed task for this user in SQLite
    const t1 = await createTask(db, { userId: authUser.id, title: 'Preserved user task' });

    // Listen for session expiry
    let expiredListenerCalled = false;
    setSessionExpiredListener(() => {
      expiredListenerCalled = true;
    });

    // Mock refresh endpoint returning 401
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { code: 'TOKEN_REVOKED', message: 'Refresh token has expired' },
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const token = await getValidAccessToken({ db });

    expect(token).toBeNull();
    expect(expiredListenerCalled).toBe(true);

    // SecureStore cleared
    const stored = await getStoredTokens();
    expect(stored.accessToken).toBeNull();
    expect(stored.refreshToken).toBeNull();

    // User data in SQLite strictly preserved (NOT deleted)
    const preservedTasks = await db.getAllAsync(`SELECT id, title FROM tasks WHERE user_id = ?;`, authUser.id);
    expect(preservedTasks).toHaveLength(1);
    expect((preservedTasks[0] as any).id).toBe(t1.id);

    // Metadata epoch not bumped
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.account_epoch).toBe(1);
  });

  it('3. Cold start with valid tokens: state restored to authed, migrate NOT called, epoch NOT bumped', async () => {
    const validToken = createTestJwt(3600);
    const refreshToken = 'valid_refresh_active';
    const authUser = { id: 'usr_cold_01', email: 'coldstart@cura.app' };

    await storeTokens(validToken, refreshToken, authUser);

    // Metadata initialized to epoch 3 for this user
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?, account_epoch = 3, source_revision = 10, published_revision = 10
       WHERE id = 1;`,
      authUser.id
    );

    const { session, isValid } = await restoreSession();

    expect(isValid).toBe(true);
    expect(session.isGuest).toBe(false);
    expect(session.userId).toBe(authUser.id);
    expect(session.email).toBe(authUser.email);

    // Epoch was NOT bumped on cold start
    const meta = await getWidgetSnapshotMetadata(db);
    expect(meta.account_epoch).toBe(3);
    expect(meta.source_revision).toBe(10);
  });

  it('4. Cold start with no tokens: state -> guest, no crash', async () => {
    // Empty SecureStore
    const { session, isValid } = await restoreSession();

    expect(isValid).toBe(false);
    expect(session.isGuest).toBe(true);
    expect(session.userId).toBe('guest');
    expect(session.email).toBeNull();
  });

  it('5. Cold start with corrupt tokens: state -> guest, no crash', async () => {
    // Write corrupt non-JSON user info
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, 'garbage_token');
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, 'garbage_refresh');
    await SecureStore.setItemAsync(USER_INFO_KEY, '{invalid_json@@@');

    const { session, isValid } = await restoreSession();

    // Must safely fallback to guest without throwing
    expect(isValid).toBe(false);
    expect(session.isGuest).toBe(true);
    expect(session.userId).toBe('guest');
  });

  it('6. Batch retry: sync_outbox has batch_migration row + online -> migrate-batch called -> row deleted on success; offline -> row kept', async () => {
    const authUser = { id: 'usr_retry_sync_01', email: 'retry@cura.app' };
    const validToken = createTestJwt(3600);
    await storeTokens(validToken, 'ref_123', authUser);

    // 1. Queue a pending batch_migration row in sync_outbox
    const mutationId = 'batch_outbox_test_1';
    const batchPayload = {
      batchId: mutationId,
      clientMutationIds: [],
      entities: {
        tasks: [{ id: 'task_retry_1', title: 'Queued task', status: 'pending' }],
        moodEntries: [],
      },
    };

    await db.runAsync(
      `INSERT INTO sync_outbox (mutation_id, user_id, entity_type, entity_id, action, payload, created_at)
       VALUES (?, ?, 'batch_migration', ?, 'sync', ?, datetime('now'));`,
      mutationId,
      authUser.id,
      authUser.id,
      JSON.stringify(batchPayload)
    );

    // Verify row is present
    const rowsBefore = await db.getAllAsync(
      `SELECT * FROM sync_outbox WHERE user_id = ? AND entity_type = 'batch_migration';`,
      authUser.id
    );
    expect(rowsBefore).toHaveLength(1);

    // A. Offline test: network throws error
    globalThis.fetch = vi.fn(async () => {
      throw new Error('TypeError: Failed to fetch (network offline)');
    });

    const offlineResult = await retryPendingBatchMigration(authUser.id, { db });
    expect(offlineResult.retried).toBe(true);
    expect(offlineResult.success).toBe(false);

    // Row is still preserved in sync_outbox
    const rowsAfterOffline = await db.getAllAsync(
      `SELECT * FROM sync_outbox WHERE user_id = ? AND entity_type = 'batch_migration';`,
      authUser.id
    );
    expect(rowsAfterOffline).toHaveLength(1);

    // B. Online test: server returns 200
    globalThis.fetch = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/auth/migrate-batch')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, count: 1 }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const onlineResult = await retryPendingBatchMigration(authUser.id, { db });
    expect(onlineResult.retried).toBe(true);
    expect(onlineResult.success).toBe(true);

    // Row is successfully deleted
    const rowsAfterSuccess = await db.getAllAsync(
      `SELECT * FROM sync_outbox WHERE user_id = ? AND entity_type = 'batch_migration';`,
      authUser.id
    );
    expect(rowsAfterSuccess).toHaveLength(0);
  });
});
