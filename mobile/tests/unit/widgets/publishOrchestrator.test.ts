import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../../helpers/sqliteAdapter';
import { runMigrations } from '../../../src/db/migrations';
import { createTask } from '../../../src/db/taskRepository';
import { createMoodEntry } from '../../../src/db/moodRepository';
import {
  orchestrateWidgetPublish,
  WidgetNativePublisher,
} from '../../../src/services/widgets/publishOrchestrator';
import { getWidgetSnapshotMetadata } from '../../../src/services/widgets/snapshotBuilder';
import { WidgetSnapshot } from '../../../src/services/widgets/types';

describe('Widget Publish Orchestration Unit Tests', () => {
  let db: NodeSQLiteAdapter;
  const userId = 'usr_test';

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Initial state: source_revision = 0, published_revision = 0
    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET user_id = ?, source_revision = 0, published_revision = 0 WHERE id = 1;`,
      userId
    );
  });

  it('When source_revision == published_revision -> returns skippedReason = UP_TO_DATE, publisher NOT called, no file written', async () => {
    const publisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);

    const result = await orchestrateWidgetPublish(db, {
      userId,
      publisher,
    });

    expect(result.published).toBe(false);
    expect(result.skippedReason).toBe('UP_TO_DATE');
    expect(publisher).not.toHaveBeenCalled();
  });

  it('When source_revision > published_revision -> publisher called once with snapshot matching sourceRevision, then published_revision updated to sourceRevision', async () => {
    // Create task -> triggers advance source_revision to 1
    await createTask(db, { userId, title: 'Task to advance revision' });

    const metaBefore = await getWidgetSnapshotMetadata(db);
    expect(metaBefore.source_revision).toBeGreaterThan(metaBefore.published_revision);

    let capturedSnapshot: WidgetSnapshot | null = null;
    const publisher = vi.fn<WidgetNativePublisher>().mockImplementation(async (snapshot) => {
      capturedSnapshot = snapshot;
      return true;
    });

    const result = await orchestrateWidgetPublish(db, {
      userId,
      publisher,
    });

    expect(result.published).toBe(true);
    expect(publisher).toHaveBeenCalledTimes(1);
    expect(capturedSnapshot).not.toBeNull();
    expect(capturedSnapshot!.sourceRevision).toBe(metaBefore.source_revision);

    // Verify published_revision updated in SQLite
    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.published_revision).toBe(metaBefore.source_revision);
    expect(result.publishedRevision).toBe(metaBefore.source_revision);
  });

  it('When publisher returns false / throws -> published_revision does NOT advance, next call retries', async () => {
    await createTask(db, { userId, title: 'Task for failed publish' });
    const metaBefore = await getWidgetSnapshotMetadata(db);

    // 1. Publisher returns false
    const failingPublisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(false);
    const failResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: failingPublisher,
    });

    expect(failResult.published).toBe(false);
    expect(failResult.skippedReason).toBe('PUBLISHER_FAILED');

    let metaCheck = await getWidgetSnapshotMetadata(db);
    expect(metaCheck.published_revision).toBe(metaBefore.published_revision);

    // 2. Publisher throws error
    const throwingPublisher = vi.fn<WidgetNativePublisher>().mockRejectedValue(new Error('IPC Bridge error'));
    const throwResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: throwingPublisher,
    });

    expect(throwResult.published).toBe(false);
    expect(throwResult.skippedReason).toBe('PUBLISHER_FAILED');

    metaCheck = await getWidgetSnapshotMetadata(db);
    expect(metaCheck.published_revision).toBe(metaBefore.published_revision);

    // 3. Next call succeeds -> retries cleanly and advances
    const succeedingPublisher = vi.fn<WidgetNativePublisher>().mockResolvedValue(true);
    const retryResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: succeedingPublisher,
    });

    expect(retryResult.published).toBe(true);
    const metaFinal = await getWidgetSnapshotMetadata(db);
    expect(metaFinal.published_revision).toBe(metaBefore.source_revision);
  });

  it('Publisher receives snapshot where tasks, mood, quote all match DB state at read time', async () => {
    await createTask(db, { userId, title: 'Read-Time Task', dueDate: '2026-11-08' });
    await createMoodEntry(db, { userId, moodType: 'calm', loggedAt: '2026-11-08T15:00:00.000Z' });

    let receivedSnapshot: WidgetSnapshot | null = null;
    const publisher = vi.fn<WidgetNativePublisher>().mockImplementation(async (snapshot) => {
      receivedSnapshot = snapshot;
      return true;
    });

    await orchestrateWidgetPublish(db, {
      userId,
      currentDate: '2026-11-08',
      publisher,
    });

    expect(receivedSnapshot).not.toBeNull();
    expect(receivedSnapshot!.userId).toBe(userId);
    expect(receivedSnapshot!.tasks.todayTotal).toBe(1);
    expect(receivedSnapshot!.tasks.items[0].title).toBe('Read-Time Task');
    expect(receivedSnapshot!.mood.latestMoodType).toBe('calm');
    expect(receivedSnapshot!.mood.latestLoggedAt).toBe('2026-11-08T15:00:00.000Z');
    expect(receivedSnapshot!.quote).toBeDefined();
    expect(receivedSnapshot!.quote.text).toBeTruthy();
  });
});
