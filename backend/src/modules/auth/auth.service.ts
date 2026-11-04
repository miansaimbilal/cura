import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index';
import {
  users,
  userPreferences,
  refreshTokens,
  tasks,
  moodEntries,
  migrationBatches,
  mutationIdempotency,
} from '../../db/schema/index';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import type { RegisterInput, LoginInput, MigrateBatchInput } from './auth.schema';
import type { JwtTokenPayload } from '../../types/index';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokens(userId: string, email: string) {
  const accessTokenPayload: JwtTokenPayload = {
    userId,
    email,
    type: 'access',
  };

  const refreshTokenPayload: JwtTokenPayload = {
    userId,
    email,
    type: 'refresh',
  };

  const accessToken = jwt.sign(accessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(refreshTokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });

  return { accessToken, refreshToken };
}

export class AuthService {
  static async register(input: RegisterInput) {
    // 1. Check existing email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email address already exists');
    }

    // 2. Hash password with bcrypt work factor 12
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    // 3. Create user and default preferences in a transaction
    const newUser = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          email: input.email.toLowerCase(),
          passwordHash,
          displayName: input.displayName || null,
          timezone: input.timezone || 'UTC',
        })
        .returning();

      await tx.insert(userPreferences).values({
        userId: createdUser.id,
      });

      return createdUser;
    });

    // 4. Generate tokens
    const { accessToken, refreshToken } = generateTokens(newUser.id, newUser.email);

    // 5. Save hashed refresh token
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(refreshTokens).values({
      userId: newUser.id,
      tokenHash,
      expiresAt,
    });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        timezone: newUser.timezone,
        createdAt: newUser.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: env.JWT_ACCESS_EXPIRY,
      },
    };
  }

  static async login(input: LoginInput) {
    // 1. Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 3. Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    // 4. Save hashed refresh token
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: env.JWT_ACCESS_EXPIRY,
      },
    };
  }

  static async refreshToken(token: string) {
    try {
      // 1. Verify token signature
      const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtTokenPayload;
      if (payload.type !== 'refresh') {
        throw new AppError(401, 'INVALID_TOKEN', 'Supplied token is not a refresh token');
      }

      // 2. Check user exists
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!user) {
        throw new AppError(401, 'USER_NOT_FOUND', 'User associated with token no longer exists');
      }

      const tokenHash = hashToken(token);
      const newTokens = generateTokens(user.id, user.email);
      const newTokenHash = hashToken(newTokens.refreshToken);
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // 3. Atomically revoke the old token and insert the new token
      // Concurrent requests will race on this update; only the one that finds revokedAt IS NULL succeeds.
      await db.transaction(async (tx) => {
        // Atomic conditional update ensuring single-use and race condition safety
        const [revokedRecord] = await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(refreshTokens.tokenHash, tokenHash),
              eq(refreshTokens.userId, payload.userId),
              isNull(refreshTokens.revokedAt)
            )
          )
          .returning();

        if (!revokedRecord) {
          throw new AppError(
            401,
            'TOKEN_REVOKED',
            'Refresh token is expired, has been revoked, or was already used'
          );
        }

        if (new Date(revokedRecord.expiresAt) < new Date()) {
          throw new AppError(401, 'TOKEN_REVOKED', 'Refresh token has expired');
        }

        // Insert new token
        await tx.insert(refreshTokens).values({
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        });
      });

      return {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresIn: env.JWT_ACCESS_EXPIRY,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired refresh token');
    }
  }

  static async logout(token?: string, userId?: string) {
    if (token) {
      const tokenHash = hashToken(token);
      const conditions = [
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
      ];
      if (userId) {
        conditions.push(eq(refreshTokens.userId, userId));
      }

      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(...conditions));
    }
    return { success: true };
  }

  static async getCurrentUser(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        timezone: users.timezone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return {
      user,
      preferences: prefs || null,
    };
  }

  static async migrateBatch(userId: string, input: MigrateBatchInput) {
    // 1. Idempotency Check: Check if batch already processed for this specific authenticated user
    const [existingBatch] = await db
      .select()
      .from(migrationBatches)
      .where(
        and(
          eq(migrationBatches.batchId, input.batchId),
          eq(migrationBatches.userId, userId)
        )
      )
      .limit(1);

    if (existingBatch) {
      return {
        batchId: input.batchId,
        status: 'already_processed',
        confirmedEntityIds: {
          tasks: input.entities.tasks.map((t) => t.id),
          moodEntries: input.entities.moodEntries.map((m) => m.id),
        },
        confirmedMutationIds: input.clientMutationIds,
        processedAt: existingBatch.processedAt,
      };
    }

    try {
      // 2. Process Batch in Database Transaction
      const result = await db.transaction(async (tx) => {
        const confirmedTaskIds: string[] = [];
        const confirmedMoodIds: string[] = [];

        // A. Insert tasks with ON CONFLICT (id) DO NOTHING
        for (const task of input.entities.tasks) {
          const [insertedTask] = await tx
            .insert(tasks)
            .values({
              id: task.id,
              userId,
              title: task.title,
              description: task.description || null,
              dueDate: task.dueDate || null,
              dueTime: task.dueTime || null,
              isTimed: task.isTimed ?? false,
              status: task.status ?? 'pending',
              completedAt: task.completedAt ? new Date(task.completedAt) : null,
              postponedAt: task.postponedAt ? new Date(task.postponedAt) : null,
              createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
            })
            .onConflictDoNothing({ target: tasks.id })
            .returning({ id: tasks.id });

          if (insertedTask) {
            confirmedTaskIds.push(insertedTask.id);
          } else {
            // Check if existing task belongs to this user (idempotent retry)
            const [existingUserTask] = await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)))
              .limit(1);
            if (existingUserTask) {
              confirmedTaskIds.push(existingUserTask.id);
            }
            // If it belongs to another user, it is NOT confirmed for this user
          }
        }

        // B. Insert mood entries with ON CONFLICT (id) DO NOTHING
        for (const mood of input.entities.moodEntries) {
          const [insertedMood] = await tx
            .insert(moodEntries)
            .values({
              id: mood.id,
              userId,
              moodType: mood.moodType,
              note: mood.note || null,
              tags: mood.tags ?? [],
              loggedAt: new Date(mood.loggedAt),
              createdAt: mood.createdAt ? new Date(mood.createdAt) : new Date(),
            })
            .onConflictDoNothing({ target: moodEntries.id })
            .returning({ id: moodEntries.id });

          if (insertedMood) {
            confirmedMoodIds.push(insertedMood.id);
          } else {
            const [existingUserMood] = await tx
              .select({ id: moodEntries.id })
              .from(moodEntries)
              .where(and(eq(moodEntries.id, mood.id), eq(moodEntries.userId, userId)))
              .limit(1);
            if (existingUserMood) {
              confirmedMoodIds.push(existingUserMood.id);
            }
          }
        }

        // C. Update user preferences if supplied
        if (input.entities.userPreferences) {
          const updateData: Partial<typeof userPreferences.$inferInsert> = {};
          if (input.entities.userPreferences.themeMode) {
            updateData.themeMode = input.entities.userPreferences.themeMode;
          }
          if (input.entities.userPreferences.selectedChatProvider) {
            updateData.selectedChatProvider = input.entities.userPreferences.selectedChatProvider;
          }
          if (input.entities.userPreferences.selectedChatModel) {
            updateData.selectedChatModel = input.entities.userPreferences.selectedChatModel;
          }
          if (input.entities.userPreferences.selectedCountry) {
            updateData.selectedCountry = input.entities.userPreferences.selectedCountry;
          }
          if (input.entities.userPreferences.morningCheckinTime) {
            updateData.morningCheckinTime = input.entities.userPreferences.morningCheckinTime;
          }
          if (input.entities.userPreferences.eveningCheckinTime) {
            updateData.eveningCheckinTime = input.entities.userPreferences.eveningCheckinTime;
          }
          if (input.entities.userPreferences.eodReminderTime) {
            updateData.eodReminderTime = input.entities.userPreferences.eodReminderTime;
          }

          if (Object.keys(updateData).length > 0) {
            await tx
              .update(userPreferences)
              .set({ ...updateData, updatedAt: new Date() })
              .where(eq(userPreferences.userId, userId));
          }
        }

        // D. Record processed clientMutationIds for idempotency (scoped to this user)
        for (const mutationId of input.clientMutationIds) {
          await tx
            .insert(mutationIdempotency)
            .values({
              userId,
              clientMutationId: mutationId,
              entityType: 'migration_batch',
              entityId: input.entities.tasks[0]?.id || input.entities.moodEntries[0]?.id || userId,
            })
            .onConflictDoNothing();
        }

        // E. Record migration batch record
        const [batchRecord] = await tx
          .insert(migrationBatches)
          .values({
            userId,
            batchId: input.batchId,
            clientMutationIds: input.clientMutationIds,
            entityCounts: {
              tasks: input.entities.tasks.length,
              moodEntries: input.entities.moodEntries.length,
            },
            status: 'completed',
          })
          .returning();

        return {
          batchId: input.batchId,
          status: 'completed',
          confirmedEntityIds: {
            tasks: confirmedTaskIds,
            moodEntries: confirmedMoodIds,
          },
          confirmedMutationIds: input.clientMutationIds,
          processedAt: batchRecord.processedAt,
        };
      });

      return result;
    } catch (error: unknown) {
      // In case of concurrent duplicate submission winning the race to commit,
      // unique constraint violation (23505) safely catches it and returns already_processed
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
        const [existingBatch] = await db
          .select()
          .from(migrationBatches)
          .where(
            and(
              eq(migrationBatches.batchId, input.batchId),
              eq(migrationBatches.userId, userId)
            )
          )
          .limit(1);

        if (existingBatch) {
          return {
            batchId: input.batchId,
            status: 'already_processed',
            confirmedEntityIds: {
              tasks: input.entities.tasks.map((t) => t.id),
              moodEntries: input.entities.moodEntries.map((m) => m.id),
            },
            confirmedMutationIds: input.clientMutationIds,
            processedAt: existingBatch.processedAt,
          };
        }
      }
      throw error;
    }
  }
}
