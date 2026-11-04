import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema/index';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '../src/config/env';

describe('Real In-Memory PostgreSQL Integration Tests (PGlite)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    // 1. Initialize in-memory PostgreSQL engine
    client = new PGlite();
    db = drizzle(client, { schema });

    // 2. Read and execute the real generated SQL migrations
    const migration0 = fs.readFileSync(
      path.resolve(__dirname, '../src/db/migrations/0000_redundant_hannibal_king.sql'),
      'utf8'
    );
    const migration1 = fs.readFileSync(
      path.resolve(__dirname, '../src/db/migrations/0001_demonic_misty_knight.sql'),
      'utf8'
    );

    // Split statements on Drizzle breakpoint and execute sequentially
    const statements = [...migration0.split('--> statement-breakpoint'), ...migration1.split('--> statement-breakpoint')];
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed) {
        await client.exec(trimmed);
      }
    }
  });

  afterAll(async () => {
    await client.close();
  });

  describe('PostgreSQL Schema Constraints & Foreign Keys', () => {
    it('should enforce unique email constraint on users table in real Postgres', async () => {
      const passwordHash = await bcrypt.hash('Secret123!', 10);
      const email = 'unique.test@cura.app';

      // First insert succeeds
      await db.insert(schema.users).values({
        email,
        passwordHash,
      });

      // Second insert with duplicate email must fail with Postgres unique violation 23505
      await expect(
        db.insert(schema.users).values({
          email,
          passwordHash,
        })
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraint and cascade deletion', async () => {
      const passwordHash = await bcrypt.hash('Secret123!', 10);
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'cascade.test@cura.app',
          passwordHash,
        })
        .returning();

      // Insert related task and preferences
      await db.insert(schema.userPreferences).values({ userId: user.id });
      const [task] = await db
        .insert(schema.tasks)
        .values({
          userId: user.id,
          title: 'Cascade task',
        })
        .returning();

      expect(task.userId).toBe(user.id);

      // Deleting user must cascade and delete task & preferences
      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      const orphanedTasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, task.id));
      expect(orphanedTasks.length).toBe(0);

      const orphanedPrefs = await db
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, user.id));
      expect(orphanedPrefs.length).toBe(0);
    });
  });

  describe('Refresh Token Rotation & Single-Use Semantics', () => {
    function hashToken(token: string): string {
      return crypto.createHash('sha256').update(token).digest('hex');
    }

    it('should allow a refresh token to be used once and reject second use', async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'refresh.test@cura.app',
          passwordHash: 'dummy-hash',
        })
        .returning();

      const rawRefreshToken = 'test-refresh-token-12345';
      const tokenHash = hashToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(schema.refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // First use: atomically revoke the token
      const [revokedRecord] = await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.refreshTokens.tokenHash, tokenHash),
            eq(schema.refreshTokens.userId, user.id),
            isNull(schema.refreshTokens.revokedAt)
          )
        )
        .returning();

      expect(revokedRecord).toBeDefined();
      expect(revokedRecord.revokedAt).not.toBeNull();

      // Second use with the same token: condition isNull(revokedAt) fails!
      const [secondAttempt] = await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.refreshTokens.tokenHash, tokenHash),
            eq(schema.refreshTokens.userId, user.id),
            isNull(schema.refreshTokens.revokedAt)
          )
        )
        .returning();

      expect(secondAttempt).toBeUndefined(); // Atomic check prevented token reuse
    });

    it('should reject two concurrent refresh requests using the exact same token', async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          email: 'concurrent.refresh@cura.app',
          passwordHash: 'dummy-hash',
        })
        .returning();

      const tokenHash = hashToken('concurrent-token-abc');
      await db.insert(schema.refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Simulate concurrent requests racing to revoke and replace
      const executeRefresh = async () => {
        return db.transaction(async (tx) => {
          const [revoked] = await tx
            .update(schema.refreshTokens)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(schema.refreshTokens.tokenHash, tokenHash),
                eq(schema.refreshTokens.userId, user.id),
                isNull(schema.refreshTokens.revokedAt)
              )
            )
            .returning();

          if (!revoked) {
            throw new Error('TOKEN_REVOKED');
          }

          // Insert new token
          await tx.insert(schema.refreshTokens).values({
            userId: user.id,
            tokenHash: hashToken(`new-${Math.random()}`),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });

          return 'SUCCESS';
        });
      };

      const results = await Promise.allSettled([executeRefresh(), executeRefresh()]);

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      // Exactly ONE request must succeed and exactly ONE must fail!
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);
      expect((failures[0] as PromiseRejectedResult).reason.message).toBe('TOKEN_REVOKED');
    });
  });

  describe('Migration Idempotency & Cross-User Security', () => {
    it('should prevent cross-user overwrite: User B cannot overwrite User A task', async () => {
      // 1. Create User A and User B
      const [userA] = await db
        .insert(schema.users)
        .values({ email: 'user.a@cura.app', passwordHash: 'hash-a' })
        .returning();
      const [userB] = await db
        .insert(schema.users)
        .values({ email: 'user.b@cura.app', passwordHash: 'hash-b' })
        .returning();

      const sharedTaskId = '77777777-7777-7777-7777-777777777777';

      // 2. User A inserts task
      await db.insert(schema.tasks).values({
        id: sharedTaskId,
        userId: userA.id,
        title: 'User A private task',
      });

      // 3. User B attempts to migrate a task with the exact same ID
      const [userBInsert] = await db
        .insert(schema.tasks)
        .values({
          id: sharedTaskId,
          userId: userB.id,
          title: 'Malicious overwrite attempt by User B',
        })
        .onConflictDoNothing({ target: schema.tasks.id })
        .returning();

      // ON CONFLICT (id) DO NOTHING prevented insert
      expect(userBInsert).toBeUndefined();

      // Verify the task in DB still strictly belongs to User A
      const [taskInDb] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, sharedTaskId));

      expect(taskInDb.userId).toBe(userA.id);
      expect(taskInDb.title).toBe('User A private task');
    });

    it('should rollback entire transaction if migration batch fails midway', async () => {
      const [user] = await db
        .insert(schema.users)
        .values({ email: 'rollback.test@cura.app', passwordHash: 'hash' })
        .returning();

      const validTaskId = '88888888-8888-8888-8888-888888888888';

      // Execute a transaction that inserts a valid task but subsequently throws
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(schema.tasks).values({
            id: validTaskId,
            userId: user.id,
            title: 'Should be rolled back',
          });

          // Simulate mid-transaction error (e.g. malformed data or constraint failure)
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        })
      ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

      // The task must NOT exist in the database (atomic rollback verified)
      const rolledBackTask = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, validTaskId));

      expect(rolledBackTask.length).toBe(0);
    });

    it('should enforce per-user batch_id uniqueness and reject duplicate batch insert', async () => {
      const [userA] = await db
        .insert(schema.users)
        .values({ email: 'batch.a@cura.app', passwordHash: 'hash' })
        .returning();
      const [userB] = await db
        .insert(schema.users)
        .values({ email: 'batch.b@cura.app', passwordHash: 'hash' })
        .returning();

      const batchId = 'shared-batch-uuid-001';

      // User A creates batch
      await db.insert(schema.migrationBatches).values({
        userId: userA.id,
        batchId,
        clientMutationIds: ['m1'],
        entityCounts: { tasks: 1 },
      });

      // User B CAN create a batch with the same batchId because uniqueness is scoped to (user_id, batch_id)
      const [userBBatch] = await db
        .insert(schema.migrationBatches)
        .values({
          userId: userB.id,
          batchId,
          clientMutationIds: ['m2'],
          entityCounts: { tasks: 1 },
        })
        .returning();

      expect(userBBatch.userId).toBe(userB.id);

      // But User A submitting the same batchId a second time violates (user_id, batch_id) unique constraint!
      await expect(
        db.insert(schema.migrationBatches).values({
          userId: userA.id,
          batchId,
          clientMutationIds: ['m1'],
          entityCounts: { tasks: 1 },
        })
      ).rejects.toThrow();
    });
  });
});
