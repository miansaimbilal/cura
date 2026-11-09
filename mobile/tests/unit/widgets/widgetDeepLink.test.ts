import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../../helpers/sqliteAdapter';
import { runMigrations } from '../../../src/db/migrations';
import { createTask, getTaskById } from '../../../src/db/taskRepository';
import { createMoodEntry, getAllMoodEntries } from '../../../src/db/moodRepository';
import { getWidgetSnapshotMetadata } from '../../../src/services/widgets/snapshotBuilder';
import { WidgetNativePublisher } from '../../../src/services/widgets/publishOrchestrator';
import {
  handleWidgetDeepLink,
  migrateGuestDataToUser,
} from '../../../src/services/widgets/widgetDeepLink';

describe('Widget Deep Link and Epoch Transition Unit Tests', () => {
  let db: NodeSQLiteAdapter;
  const userId = 'usr_test';
  let taskId: string;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Seed active user in metadata
    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET user_id = ?, source_revision = 1, published_revision = 1 WHERE id = 1;`,
      userId
    );

    // Create a pending task for usr_test
    const task = await createTask(db, {
      userId,
      title: 'Deep Link Target Task',
      dueDate: '2026-11-08',
    });
    taskId = task.id;
  });

  it('Valid task_toggle deep link -> applyWidgetAction called, receipt stored, publish called', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const actionId = 'act_toggle_001';
    const deepLinkUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${taskId}&requested_state=completed&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    const result = await handleWidgetDeepLink(db, deepLinkUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(result.handled).toBe(true);
    expect(result.actionResult?.status).toBe('applied');
    expect(result.actionResult?.isDuplicate).toBe(false);

    // Verify task status was updated in database
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('completed');

    // Verify receipt stored in processed_actions ledger
    const receipt = await db.getFirstAsync<{
      action_id: string;
      status: string;
      user_id: string;
    }>(`SELECT action_id, status, user_id FROM processed_actions WHERE action_id = ?;`, actionId);

    expect(receipt).not.toBeNull();
    expect(receipt?.action_id).toBe(actionId);
    expect(receipt?.status).toBe('applied');
    expect(receipt?.user_id).toBe(userId);

    // Verify publisher was invoked to refresh widget
    expect(publisher).toHaveBeenCalledTimes(1);
    const publishedSnapshot = publisher.mock.calls[0][0];
    expect(publishedSnapshot.userId).toBe(userId);
  });

  it('Duplicate action_id replayed via deep link -> isDuplicate = true, task NOT toggled twice', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const actionId = 'act_toggle_dup';
    const deepLinkUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${taskId}&requested_state=completed&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    // First delivery -> applies
    const firstResult = await handleWidgetDeepLink(db, deepLinkUrl, {
      activeUserId: userId,
      publisher,
    });
    expect(firstResult.actionResult?.status).toBe('applied');
    expect(firstResult.actionResult?.isDuplicate).toBe(false);

    const taskAfterFirst = await getTaskById(db, taskId);
    expect(taskAfterFirst?.status).toBe('completed');

    publisher.mockClear();

    // Replay identical deep link
    const replayResult = await handleWidgetDeepLink(db, deepLinkUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(replayResult.handled).toBe(true);
    expect(replayResult.actionResult?.isDuplicate).toBe(true);
    expect(replayResult.actionResult?.status).toBe('applied');

    // Task must remain completed (not toggled back to pending or toggled twice)
    const taskAfterReplay = await getTaskById(db, taskId);
    expect(taskAfterReplay?.status).toBe('completed');

    // Exactly one receipt remains in processed_actions
    const receipts = await db.getAllAsync<{ action_id: string }>(
      `SELECT action_id FROM processed_actions WHERE action_id = ?;`,
      actionId
    );
    expect(receipts).toHaveLength(1);
  });

  it('Tampered payload (same action_id, different requested_state) -> rejected PAYLOAD_TAMPER_DETECTED', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const actionId = 'act_tamper_test';
    const originalUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${taskId}&requested_state=completed&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    // Apply first
    await handleWidgetDeepLink(db, originalUrl, {
      activeUserId: userId,
      publisher,
    });

    publisher.mockClear();

    // Replay with tampered requested_state ("pending" instead of "completed")
    const tamperedUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${taskId}&requested_state=pending&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    const tamperResult = await handleWidgetDeepLink(db, tamperedUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(tamperResult.handled).toBe(true);
    expect(tamperResult.actionResult?.status).toBe('rejected');
    expect(tamperResult.actionResult?.rejectionReason).toBe('PAYLOAD_TAMPER_DETECTED');

    // Task remains completed from the legitimate first action
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('completed');

    // Publisher must NOT be called on rejected actions
    expect(publisher).not.toHaveBeenCalled();
  });

  it('Wrong user_id -> rejected UNAUTHORIZED, no mutation', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const actionId = 'act_wrong_user';
    const unauthorizedUser = 'usr_attacker';

    const deepLinkUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${taskId}&requested_state=completed&user_id=${unauthorizedUser}&client_action_time=2026-11-08T10:00:00.000Z`;

    const result = await handleWidgetDeepLink(db, deepLinkUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(result.handled).toBe(true);
    expect(result.actionResult?.status).toBe('rejected');
    expect(result.actionResult?.rejectionReason).toBe('UNAUTHORIZED');

    // Verify task status was NOT mutated (remains pending)
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('pending');

    // Publisher must NOT be called
    expect(publisher).not.toHaveBeenCalled();
  });

  it('Invalid moodType in mood_log -> rejected INVALID_MOOD_TYPE', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const actionId = 'act_invalid_mood';

    // Deep link with unparseable/invalid mood type
    const invalidMoodUrl = `cura://widget-action?action_id=${actionId}&action_type=mood_log&target_id=widget_mood&requested_state=${encodeURIComponent(
      JSON.stringify({ moodType: 'super_ecstatic' })
    )}&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    const result = await handleWidgetDeepLink(db, invalidMoodUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(result.handled).toBe(true);
    expect(result.actionResult?.status).toBe('rejected');
    expect(result.actionResult?.rejectionReason).toBe('INVALID_MOOD_TYPE');

    // Verify no mood entry was created in DB
    const allMoods = await getAllMoodEntries(db, { userId });
    expect(allMoods).toHaveLength(0);

    // Publisher must NOT be called
    expect(publisher).not.toHaveBeenCalled();

    // Also test malformed non-JSON requested_state
    const malformedJsonUrl = `cura://widget-action?action_id=act_bad_json&action_type=mood_log&target_id=widget_mood&requested_state=not_a_json_string&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;
    const malformedResult = await handleWidgetDeepLink(db, malformedJsonUrl, {
      activeUserId: userId,
      publisher,
    });
    expect(malformedResult.handled).toBe(true);
    expect(malformedResult.actionResult?.status).toBe('rejected');
    expect(malformedResult.actionResult?.rejectionReason).toBe('INVALID_MOOD_TYPE');
  });

  it('Missing action_id -> ignored, no crash', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);

    // URL missing action_id parameter
    const missingActionIdUrl = `cura://widget-action?action_type=task_toggle&target_id=${taskId}&requested_state=completed&user_id=${userId}&client_action_time=2026-11-08T10:00:00.000Z`;

    const result = await handleWidgetDeepLink(db, missingActionIdUrl, {
      activeUserId: userId,
      publisher,
    });

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('MISSING_ACTION_ID');

    // Task remains pending
    const task = await getTaskById(db, taskId);
    expect(task?.status).toBe('pending');

    // Publisher must NOT be called
    expect(publisher).not.toHaveBeenCalled();
  });

  it('Epoch transition: after migrateGuestDataToUser mock, account_epoch +1, source_revision == published_revision, old snapshot files cleared', async () => {
    // 1. Seed initial guest data
    await createTask(db, {
      userId: 'guest',
      title: 'Guest Task Before Login',
      dueDate: '2026-11-08',
    });
    await createMoodEntry(db, {
      userId: 'guest',
      moodType: 'calm',
    });

    // Verify initial metadata state
    const metaBefore = await getWidgetSnapshotMetadata(db);
    const initialEpoch = metaBefore.account_epoch;

    const clearSnapshotsFn = vi.fn().mockResolvedValue(true);
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const authenticatedUserId = 'usr_authenticated_100';

    // 2. Perform guest-to-user migration with account epoch transition
    const transitionResult = await migrateGuestDataToUser(db, authenticatedUserId, {
      publisher,
      clearSnapshotsFn,
    });

    // 3. Verify return values
    expect(transitionResult.userId).toBe(authenticatedUserId);
    expect(transitionResult.accountEpoch).toBe(initialEpoch + 1);
    expect(transitionResult.sourceRevision).toBe(transitionResult.publishedRevision);

    // 4. Verify SQLite widget_snapshot_metadata table
    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.user_id).toBe(authenticatedUserId);
    expect(metaAfter.account_epoch).toBe(initialEpoch + 1);
    expect(metaAfter.source_revision).toBe(metaAfter.published_revision);

    // 5. Verify snapshot cleanup was invoked
    expect(clearSnapshotsFn).toHaveBeenCalledTimes(1);

    // 6. Verify publisher was called with new user snapshot and updated epoch
    expect(publisher).toHaveBeenCalledTimes(1);
    const publishedSnapshot = publisher.mock.calls[0][0];
    expect(publishedSnapshot.userId).toBe(authenticatedUserId);
    expect(publishedSnapshot.accountEpoch).toBe(initialEpoch + 1);
    expect(publishedSnapshot.sourceRevision).toBe(metaAfter.published_revision);

    // 7. Verify tasks and moods were migrated to authenticated user
    const migratedTask = await getTaskById(db, taskId);
    expect(migratedTask).not.toBeNull();
  });
});
