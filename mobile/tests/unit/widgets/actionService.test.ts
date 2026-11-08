import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../../helpers/sqliteAdapter';
import { runMigrations } from '../../../src/db/migrations';
import { createTask, getTaskById } from '../../../src/db/taskRepository';
import {
  applyWidgetAction,
  computePayloadHash,
  buildCanonicalActionString,
} from '../../../src/services/widgets/actionService';
import { getWidgetSnapshotMetadata } from '../../../src/services/widgets/snapshotBuilder';

describe('Widget Action Application Service Unit Tests', () => {
  let db: NodeSQLiteAdapter;
  const userId = 'usr_test';
  let taskId: string;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Seed task_1 pending for user usr_test
    const task = await createTask(db, {
      userId,
      title: 'Initial Pending Task',
      dueDate: '2026-11-08',
    });
    taskId = task.id;
  });

  it('task_toggle to completed -> status = applied, task in DB is completed, receipt exists in processed_actions with same action_id, payload_hash matches SHA256 of canonical string', async () => {
    const actionInput = {
      actionId: 'act_101',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('applied');
    expect(result.isDuplicate).toBe(false);

    // Check task in DB
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('completed');
    expect(task?.completedAt).toBe('2026-11-08T10:00:00.000Z');

    // Check receipt in processed_actions
    const receipt = await db.getFirstAsync<{
      action_id: string;
      status: string;
      payload_hash: string;
    }>(`SELECT * FROM processed_actions WHERE action_id = ?;`, actionInput.actionId);

    expect(receipt).not.toBeNull();
    expect(receipt?.action_id).toBe('act_101');
    expect(receipt?.status).toBe('applied');

    const expectedHash = await computePayloadHash(buildCanonicalActionString(actionInput));
    expect(receipt?.payload_hash).toBe(expectedHash);
  });

  it('Same action sent again with same action_id + same payload -> isDuplicate = true, status = applied, task NOT toggled back, source_revision does NOT increase second time', async () => {
    const actionInput = {
      actionId: 'act_102',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    // First call
    const firstResult = await applyWidgetAction(db, actionInput);
    expect(firstResult.status).toBe('applied');
    expect(firstResult.isDuplicate).toBe(false);

    const metaAfterFirst = await getWidgetSnapshotMetadata(db);

    // Second delivery of same action
    const secondResult = await applyWidgetAction(db, actionInput);
    expect(secondResult.isDuplicate).toBe(true);
    expect(secondResult.status).toBe('applied');

    // Task remains completed
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('completed');

    // source_revision must not increase on duplicate replay
    const metaAfterSecond = await getWidgetSnapshotMetadata(db);
    expect(metaAfterSecond.source_revision).toBe(metaAfterFirst.source_revision);
  });

  it('Same action_id sent again with DIFFERENT payload (different requested_state) -> status = rejected, rejectionReason = PAYLOAD_TAMPER_DETECTED, task unchanged', async () => {
    const originalInput = {
      actionId: 'act_103',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    await applyWidgetAction(db, originalInput);

    // Tampered delivery: same actionId, different requestedState
    const tamperedInput = {
      ...originalInput,
      requestedState: JSON.stringify({ targetStatus: 'pending' }),
    };

    const result = await applyWidgetAction(db, tamperedInput);

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('PAYLOAD_TAMPER_DETECTED');
    expect(result.isDuplicate).toBe(false);

    // Task status remains completed (unmodified)
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('completed');
  });

  it('task_toggle to same state task already has -> status = no_op, receipt stored, task unchanged', async () => {
    // Task is currently pending; request pending
    const actionInput = {
      actionId: 'act_104',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'pending' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('no_op');

    const receipt = await db.getFirstAsync<{ status: string }>(
      `SELECT status FROM processed_actions WHERE action_id = ?;`,
      'act_104'
    );
    expect(receipt?.status).toBe('no_op');

    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('pending');
  });

  it('task_toggle for non-existent task -> status = rejected, rejectionReason = task_not_found', async () => {
    const actionInput = {
      actionId: 'act_105',
      userId,
      actionType: 'task_toggle' as const,
      targetId: 'non-existent-task-id',
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason?.toLowerCase()).toBe('task_not_found');
  });

  it('task_toggle for task owned by different user -> status = rejected, rejectionReason matches UNAUTHORIZED / user_mismatch', async () => {
    const otherUserTask = await createTask(db, {
      userId: 'other_user',
      title: 'Other Task',
    });

    const actionInput = {
      actionId: 'act_106',
      userId, // usr_test attempting to mutate other_user's task
      actionType: 'task_toggle' as const,
      targetId: otherUserTask.id,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toMatch(/UNAUTHORIZED|user_mismatch|account_mismatch/i);
  });

  it('mood_log with valid moodType -> status = applied, new row in mood_entries, receipt stored', async () => {
    const actionInput = {
      actionId: 'act_107',
      userId,
      actionType: 'mood_log' as const,
      targetId: 'new_mood',
      requestedState: JSON.stringify({ moodType: 'calm' }),
      clientActionTime: '2026-11-08T11:00:00.000Z',
    };

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('applied');

    // Verify row in mood_entries
    const moodRow = await db.getFirstAsync<{ mood_type: string; user_id: string }>(
      `SELECT mood_type, user_id FROM mood_entries WHERE user_id = ? AND mood_type = 'calm';`,
      userId
    );
    expect(moodRow).not.toBeNull();
    expect(moodRow?.mood_type).toBe('calm');

    // Verify receipt
    const receipt = await db.getFirstAsync<{ status: string }>(
      `SELECT status FROM processed_actions WHERE action_id = ?;`,
      'act_107'
    );
    expect(receipt?.status).toBe('applied');
  });

  it('mood_log with invalid moodType -> status = rejected, rejectionReason = invalid_mood_type, no row inserted', async () => {
    const actionInput = {
      actionId: 'act_108',
      userId,
      actionType: 'mood_log' as const,
      targetId: 'new_mood',
      requestedState: JSON.stringify({ moodType: 'super_ecstatic_invalid' }),
      clientActionTime: '2026-11-08T11:00:00.000Z',
    };

    const countBefore = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM mood_entries;`
    );

    const result = await applyWidgetAction(db, actionInput);

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason?.toLowerCase()).toBe('invalid_mood_type');

    const countAfter = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM mood_entries;`
    );
    expect(countAfter?.count).toBe(countBefore?.count);
  });

  it('Immutability: try UPDATE processed_actions SET status=applied -> throws. Try DELETE FROM processed_actions -> throws.', async () => {
    const actionInput = {
      actionId: 'act_109',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    await applyWidgetAction(db, actionInput);

    // Attempt UPDATE -> must throw
    await expect(
      db.runAsync(
        `UPDATE processed_actions SET status = 'no_op' WHERE action_id = ?;`,
        'act_109'
      )
    ).rejects.toThrow();

    // Attempt DELETE -> must throw
    await expect(
      db.runAsync(
        `DELETE FROM processed_actions WHERE action_id = ?;`,
        'act_109'
      )
    ).rejects.toThrow();
  });

  it('Trigger check: after task_toggle applied, widget_snapshot_metadata.source_revision increased by exactly 1', async () => {
    const metaBefore = await getWidgetSnapshotMetadata(db);

    const actionInput = {
      actionId: 'act_110',
      userId,
      actionType: 'task_toggle' as const,
      targetId: taskId,
      requestedState: JSON.stringify({ targetStatus: 'completed' }),
      clientActionTime: '2026-11-08T10:00:00.000Z',
    };

    await applyWidgetAction(db, actionInput);

    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.source_revision).toBe(metaBefore.source_revision + 1);
  });
});
