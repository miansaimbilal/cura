import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../../helpers/sqliteAdapter';
import { runMigrations } from '../../../src/db/migrations';
import { createTask } from '../../../src/db/taskRepository';
import {
  orchestrateWidgetPublish,
} from '../../../src/services/widgets/publishOrchestrator';
import { getWidgetSnapshotMetadata } from '../../../src/services/widgets/snapshotBuilder';
import {
  PublishSnapshotOptions,
  WidgetManifest,
} from '../../../modules/widget-bridge/src';

/**
 * Stateful in-memory mock simulating iOS App Group (<AppGroup>/snapshots/)
 * filesystem, NSFileCoordinator coordination, monotonicity checks, and N-1 retention pruning semantics.
 */
class MockIOSSnapshotPublisher {
  public fs: Map<string, string> = new Map();
  public currentManifest: WidgetManifest | null = null;
  public throwOnError: boolean = false;

  async publish(options: PublishSnapshotOptions): Promise<boolean> {
    if (this.throwOnError) {
      throw new Error('Simulated native iOS NSFileCoordinator I/O error');
    }

    const uuid = 'ios-test-' + Math.random().toString(36).substring(2, 8);
    const candidateFileName =
      options.candidateFile ||
      `snapshot_${options.userId}_${options.epoch}_${options.revision}_${uuid}.json`;

    // 1. Write candidate file to .tmp and rename to versioned snapshot
    this.fs.set(candidateFileName, options.contentJson);

    // 2. Coordinate manifest inspection & swap via NSFileCoordinator
    if (this.currentManifest) {
      const currentEpoch = this.currentManifest.accountEpoch;
      const currentRev = this.currentManifest.revision;

      // Monotonicity check
      if (
        options.epoch < currentEpoch ||
        (options.epoch === currentEpoch && options.revision <= currentRev)
      ) {
        // Stale revision or epoch: delete candidate and reject
        this.fs.delete(candidateFileName);
        return false;
      }

      // Epoch / user boundary check
      if (
        this.currentManifest.userId !== options.userId ||
        this.currentManifest.accountEpoch !== options.epoch
      ) {
        // Purge files from prior epochs
        this.fs.clear();
        this.fs.set(candidateFileName, options.contentJson);
        this.currentManifest = null;
      }
    }

    // 3. Atomically update manifest current.json
    const prevActive = this.currentManifest?.activeFile;
    this.currentManifest = {
      activeFile: candidateFileName,
      accountEpoch: options.epoch,
      revision: options.revision,
      userId: options.userId,
      updatedAt: new Date().toISOString(),
    };
    this.fs.set('current.json', JSON.stringify(this.currentManifest));

    // 4. Prune old snapshots: retain only active candidate (N) and previous active (N-1)
    const allowed = new Set<string>([candidateFileName, 'current.json', '.manifest.lock']);
    if (prevActive) {
      allowed.add(prevActive);
    }

    for (const fileName of Array.from(this.fs.keys())) {
      if (fileName.startsWith('snapshot_') && !allowed.has(fileName)) {
        this.fs.delete(fileName);
      }
    }

    return true;
  }
}

describe('iOS Native Snapshot Publisher Bridge Unit Tests', () => {
  let db: NodeSQLiteAdapter;
  let mockBridge: MockIOSSnapshotPublisher;
  const userId = 'usr_ios_test';

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
    mockBridge = new MockIOSSnapshotPublisher();

    // Initialize metadata
    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET user_id = ?, source_revision = 0, published_revision = 0 WHERE id = 1;`,
      userId
    );
  });

  it('Stale revision -> false, candidate deleted, manifest unchanged', async () => {
    // Setup existing published manifest at rev 5
    mockBridge.currentManifest = {
      activeFile: 'snapshot_usr_ios_test_1_5_existing.json',
      accountEpoch: 1,
      revision: 5,
      userId,
      updatedAt: '2026-11-08T12:00:00.000Z',
    };
    mockBridge.fs.set(
      mockBridge.currentManifest.activeFile,
      JSON.stringify({ schemaVersion: 1, revision: 5 })
    );

    // Attempt to publish stale revision 4
    const candidateFile = 'snapshot_usr_ios_test_1_4_candidate.json';
    const result = await mockBridge.publish({
      candidateFile,
      userId,
      epoch: 1,
      revision: 4,
      contentJson: JSON.stringify({ schemaVersion: 1, revision: 4 }),
    });

    expect(result).toBe(false);
    expect(mockBridge.fs.has(candidateFile)).toBe(false);
    expect(mockBridge.currentManifest.revision).toBe(5);
    expect(mockBridge.currentManifest.activeFile).toBe('snapshot_usr_ios_test_1_5_existing.json');
  });

  it('Stale epoch -> false, candidate deleted', async () => {
    // Current manifest at epoch 2
    mockBridge.currentManifest = {
      activeFile: 'snapshot_usr_ios_test_2_1_active.json',
      accountEpoch: 2,
      revision: 1,
      userId,
      updatedAt: '2026-11-08T12:00:00.000Z',
    };
    mockBridge.fs.set(
      mockBridge.currentManifest.activeFile,
      JSON.stringify({ schemaVersion: 1, accountEpoch: 2 })
    );

    // Attempt to publish candidate for old epoch 1
    const candidateFile = 'snapshot_usr_ios_test_1_9_candidate.json';
    const result = await mockBridge.publish({
      candidateFile,
      userId,
      epoch: 1,
      revision: 9,
      contentJson: JSON.stringify({ schemaVersion: 1, accountEpoch: 1 }),
    });

    expect(result).toBe(false);
    expect(mockBridge.fs.has(candidateFile)).toBe(false);
    expect(mockBridge.currentManifest.accountEpoch).toBe(2);
  });

  it('Valid publish -> manifest updated, published_revision advances', async () => {
    // Create task to trigger revision advance to 1
    await createTask(db, { userId, title: 'iOS task' });

    const metaBefore = await getWidgetSnapshotMetadata(db);
    expect(metaBefore.source_revision).toBe(1);
    expect(metaBefore.published_revision).toBe(0);

    const result = await orchestrateWidgetPublish(db, {
      userId,
      publisher: (snapshot) =>
        mockBridge.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot, null, 2),
        }),
    });

    expect(result.published).toBe(true);
    expect(mockBridge.currentManifest).not.toBeNull();
    expect(mockBridge.currentManifest?.revision).toBe(1);
    expect(mockBridge.currentManifest?.userId).toBe(userId);

    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.published_revision).toBe(1);
  });

  it('Failure retry -> published_revision does NOT advance, retry succeeds', async () => {
    await createTask(db, { userId, title: 'iOS retry task' });

    // 1. Simulate failure during native iOS NSFileCoordinator publication
    mockBridge.throwOnError = true;
    const failResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: (snapshot) =>
        mockBridge.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot, null, 2),
        }),
    });

    expect(failResult.published).toBe(false);
    expect(failResult.skippedReason).toBe('PUBLISHER_FAILED');

    // published_revision remains 0
    let meta = await getWidgetSnapshotMetadata(db);
    expect(meta.published_revision).toBe(0);
    expect(meta.source_revision).toBe(1);

    // 2. Retry with recovered bridge
    mockBridge.throwOnError = false;
    const retryResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: (snapshot) =>
        mockBridge.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot, null, 2),
        }),
    });

    expect(retryResult.published).toBe(true);
    meta = await getWidgetSnapshotMetadata(db);
    expect(meta.published_revision).toBe(1);
  });

  it('N-1 pruning -> after 3 publishes, exactly 2 files remain', async () => {
    // Publish revision 1
    await mockBridge.publish({
      candidateFile: 'snapshot_usr_ios_test_1_1_a.json',
      userId,
      epoch: 1,
      revision: 1,
      contentJson: '{"rev":1}',
    });

    // Publish revision 2
    await mockBridge.publish({
      candidateFile: 'snapshot_usr_ios_test_1_2_b.json',
      userId,
      epoch: 1,
      revision: 2,
      contentJson: '{"rev":2}',
    });

    // Publish revision 3
    await mockBridge.publish({
      candidateFile: 'snapshot_usr_ios_test_1_3_c.json',
      userId,
      epoch: 1,
      revision: 3,
      contentJson: '{"rev":3}',
    });

    const snapshotFiles = Array.from(mockBridge.fs.keys()).filter((k) =>
      k.startsWith('snapshot_')
    );

    // Exactly 2 snapshot files remain: N (rev 3) and N-1 (rev 2)
    expect(snapshotFiles).toHaveLength(2);
    expect(snapshotFiles).toContain('snapshot_usr_ios_test_1_3_c.json');
    expect(snapshotFiles).toContain('snapshot_usr_ios_test_1_2_b.json');
    expect(snapshotFiles).not.toContain('snapshot_usr_ios_test_1_1_a.json');
    expect(mockBridge.currentManifest?.activeFile).toBe('snapshot_usr_ios_test_1_3_c.json');
  });
});
