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
 * Stateful in-memory mock simulating Android context.filesDir/snapshots/
 * filesystem, exclusive locking, and N-1 retention pruning semantics.
 */
class MockAndroidSnapshotPublisher {
  public fs: Map<string, string> = new Map();
  public currentManifest: WidgetManifest | null = null;
  public throwOnError: boolean = false;

  async publish(options: PublishSnapshotOptions): Promise<boolean> {
    if (this.throwOnError) {
      throw new Error('Simulated native Android I/O error');
    }

    const uuid = 'test-' + Math.random().toString(36).substring(2, 8);
    const candidateFileName =
      options.candidateFile ||
      `snapshot_${options.userId}_${options.epoch}_${options.revision}_${uuid}.json`;

    // 1. Write candidate file
    this.fs.set(candidateFileName, options.contentJson);

    // 2. Lock & inspect manifest
    if (this.currentManifest) {
      const currentEpoch = this.currentManifest.accountEpoch;
      const currentRev = this.currentManifest.revision;

      // Monotonicity check
      if (
        options.epoch < currentEpoch ||
        (options.epoch === currentEpoch && options.revision <= currentRev)
      ) {
        // Stale: delete candidate file and reject
        this.fs.delete(candidateFileName);
        return false;
      }

      // Epoch / user boundary check
      if (
        this.currentManifest.userId !== options.userId ||
        this.currentManifest.accountEpoch !== options.epoch
      ) {
        // Invalidate prior epoch files
        this.fs.clear();
        this.fs.set(candidateFileName, options.contentJson);
        this.currentManifest = null;
      }
    }

    const previousActiveFile = this.currentManifest?.activeFile;

    // 3. Atomically update manifest
    this.currentManifest = {
      activeFile: candidateFileName,
      accountEpoch: options.epoch,
      revision: options.revision,
      userId: options.userId,
      updatedAt: new Date().toISOString(),
    };

    // 4. Safe retention pruning (keep active N and immediate predecessor N-1)
    const keepSet = new Set<string>([candidateFileName]);
    if (previousActiveFile) {
      keepSet.add(previousActiveFile);
    }

    for (const [filename] of Array.from(this.fs.entries())) {
      if (filename.startsWith('snapshot_') && !keepSet.has(filename)) {
        this.fs.delete(filename);
      }
    }

    return true;
  }
}

describe('Android Native Snapshot Publisher Tests', () => {
  let db: NodeSQLiteAdapter;
  let mockPublisher: MockAndroidSnapshotPublisher;
  const userId = 'usr_android';

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
    mockPublisher = new MockAndroidSnapshotPublisher();

    await db.runAsync(
      `UPDATE widget_snapshot_metadata SET user_id = ?, source_revision = 0, published_revision = 0 WHERE id = 1;`,
      userId
    );
  });

  it('Stale revision (candidate.revision <= current.revision, same epoch) -> returns false, candidate file deleted, manifest unchanged', async () => {
    // Seed existing manifest at revision 5
    mockPublisher.currentManifest = {
      activeFile: 'snapshot_usr_android_1_5_seed.json',
      accountEpoch: 1,
      revision: 5,
      userId,
      updatedAt: new Date().toISOString(),
    };
    mockPublisher.fs.set(mockPublisher.currentManifest.activeFile, '{}');

    // Attempt to publish candidate with revision 5 (stale)
    const success = await mockPublisher.publish({
      candidateFile: 'snapshot_usr_android_1_5_stale.json',
      userId,
      epoch: 1,
      revision: 5,
      contentJson: JSON.stringify({ stale: true }),
    });

    expect(success).toBe(false);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_5_stale.json')).toBe(false);
    expect(mockPublisher.currentManifest.revision).toBe(5);
    expect(mockPublisher.currentManifest.activeFile).toBe('snapshot_usr_android_1_5_seed.json');
  });

  it('Stale epoch (candidate.epoch < current.accountEpoch) -> returns false, no manifest change', async () => {
    mockPublisher.currentManifest = {
      activeFile: 'snapshot_usr_android_2_1_active.json',
      accountEpoch: 2,
      revision: 1,
      userId,
      updatedAt: new Date().toISOString(),
    };
    mockPublisher.fs.set(mockPublisher.currentManifest.activeFile, '{}');

    const success = await mockPublisher.publish({
      candidateFile: 'snapshot_usr_android_1_10_stale_epoch.json',
      userId,
      epoch: 1,
      revision: 10,
      contentJson: JSON.stringify({ oldEpoch: true }),
    });

    expect(success).toBe(false);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_10_stale_epoch.json')).toBe(false);
    expect(mockPublisher.currentManifest.accountEpoch).toBe(2);
  });

  it('Valid publish -> manifest updated, activeFile points to new file, published_revision advances via orchestrator', async () => {
    await createTask(db, { userId, title: 'Advancing Task' });
    const metaBefore = await getWidgetSnapshotMetadata(db);

    const result = await orchestrateWidgetPublish(db, {
      userId,
      publisher: async (snapshot) => {
        return await mockPublisher.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot),
        });
      },
    });

    expect(result.published).toBe(true);
    expect(mockPublisher.currentManifest).not.toBeNull();
    expect(mockPublisher.currentManifest?.revision).toBe(metaBefore.source_revision);
    expect(mockPublisher.fs.has(mockPublisher.currentManifest!.activeFile)).toBe(true);

    const metaAfter = await getWidgetSnapshotMetadata(db);
    expect(metaAfter.published_revision).toBe(metaBefore.source_revision);
  });

  it('Publisher throws -> published_revision does NOT advance, retry possible', async () => {
    await createTask(db, { userId, title: 'Retry Task' });
    const metaBefore = await getWidgetSnapshotMetadata(db);

    mockPublisher.throwOnError = true;

    // First attempt fails
    const failedResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: async (snapshot) => {
        return await mockPublisher.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot),
        });
      },
    });

    expect(failedResult.published).toBe(false);
    expect(failedResult.skippedReason).toBe('PUBLISHER_FAILED');

    let metaCheck = await getWidgetSnapshotMetadata(db);
    expect(metaCheck.published_revision).toBe(metaBefore.published_revision);

    // Second attempt recovers
    mockPublisher.throwOnError = false;
    const retryResult = await orchestrateWidgetPublish(db, {
      userId,
      publisher: async (snapshot) => {
        return await mockPublisher.publish({
          userId: snapshot.userId,
          epoch: snapshot.accountEpoch,
          revision: snapshot.sourceRevision,
          contentJson: JSON.stringify(snapshot),
        });
      },
    });

    expect(retryResult.published).toBe(true);
    metaCheck = await getWidgetSnapshotMetadata(db);
    expect(metaCheck.published_revision).toBe(metaBefore.source_revision);
  });

  it('Pruning: after 3 publishes, only N and N-1 files remain on disk (mock FS)', async () => {
    // 1st publish
    await mockPublisher.publish({
      candidateFile: 'snapshot_usr_android_1_1_rev1.json',
      userId,
      epoch: 1,
      revision: 1,
      contentJson: '{"rev": 1}',
    });
    expect(mockPublisher.fs.size).toBe(1);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_1_rev1.json')).toBe(true);

    // 2nd publish
    await mockPublisher.publish({
      candidateFile: 'snapshot_usr_android_1_2_rev2.json',
      userId,
      epoch: 1,
      revision: 2,
      contentJson: '{"rev": 2}',
    });
    expect(mockPublisher.fs.size).toBe(2);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_1_rev1.json')).toBe(true);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_2_rev2.json')).toBe(true);

    // 3rd publish -> rev 1 must be pruned, keeping rev 2 (N-1) and rev 3 (N)
    await mockPublisher.publish({
      candidateFile: 'snapshot_usr_android_1_3_rev3.json',
      userId,
      epoch: 1,
      revision: 3,
      contentJson: '{"rev": 3}',
    });

    expect(mockPublisher.fs.size).toBe(2);
    expect(mockPublisher.fs.has('snapshot_usr_android_1_1_rev1.json')).toBe(false); // Pruned
    expect(mockPublisher.fs.has('snapshot_usr_android_1_2_rev2.json')).toBe(true);  // Kept (N-1)
    expect(mockPublisher.fs.has('snapshot_usr_android_1_3_rev3.json')).toBe(true);  // Kept (N)
    expect(mockPublisher.currentManifest?.activeFile).toBe('snapshot_usr_android_1_3_rev3.json');
  });
});
