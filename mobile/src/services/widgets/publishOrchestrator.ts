import { Platform } from 'react-native';
import { IDatabase } from '../../db/types';
import { buildWidgetSnapshot, getWidgetSnapshotMetadata } from './snapshotBuilder';
import { PublishResult, WidgetSnapshot } from './types';
import { publishSnapshot as nativePublishSnapshot } from '../../../modules/widget-bridge/src';

/**
 * Pluggable publisher function signature.
 */
export type WidgetNativePublisher = (snapshot: WidgetSnapshot) => Promise<boolean>;

/**
 * Android native publisher calling the ExpoWidgetBridge module.
 */
export async function androidWidgetPublisher(snapshot: WidgetSnapshot): Promise<boolean> {
  const contentJson = JSON.stringify(snapshot, null, 2);
  return await nativePublishSnapshot({
    userId: snapshot.userId,
    epoch: snapshot.accountEpoch,
    revision: snapshot.sourceRevision,
    contentJson,
  });
}

/**
 * iOS native publisher calling the ExpoWidgetBridge module.
 */
export async function iosWidgetPublisher(snapshot: WidgetSnapshot): Promise<boolean> {
  const contentJson = JSON.stringify(snapshot, null, 2);
  return await nativePublishSnapshot({
    userId: snapshot.userId,
    epoch: snapshot.accountEpoch,
    revision: snapshot.sourceRevision,
    contentJson,
  });
}

/**
 * Resolves the default publisher based on runtime platform.
 */
export function getDefaultPublisher(): WidgetNativePublisher {
  if (Platform.OS === 'android') {
    return androidWidgetPublisher;
  }
  if (Platform.OS === 'ios') {
    return iosWidgetPublisher;
  }
  return async () => true;
}

export interface OrchestratePublishOptions {
  userId?: string;
  currentDate?: string;
  publisher?: WidgetNativePublisher;
  force?: boolean;
}

/**
 * High-level publish orchestrator (JS/TS side).
 * 1. Checks whether source_revision > published_revision (or force flag is set).
 * 2. Builds a fresh consistent snapshot via buildWidgetSnapshot.
 * 3. Prepares the payload and delegates publication to the native publisher bridge.
 * 4. Updates published_revision in widget_snapshot_metadata only after a successful publish.
 */
export async function orchestrateWidgetPublish(
  db: IDatabase,
  options: OrchestratePublishOptions = {}
): Promise<PublishResult> {
  const metadata = await getWidgetSnapshotMetadata(db);

  if (!options.force && metadata.source_revision <= metadata.published_revision) {
    return {
      published: false,
      skippedReason: 'UP_TO_DATE',
      publishedRevision: metadata.published_revision,
    };
  }

  // Build fresh snapshot from consistent SQLite state
  const snapshot = await buildWidgetSnapshot(db, {
    userId: options.userId || metadata.user_id || 'guest',
    currentDate: options.currentDate,
  });

  // Delegate to publisher (defaults to platform bridge or safe fallback)
  const publisher = options.publisher || getDefaultPublisher();
  let success = false;
  try {
    success = await publisher(snapshot);
  } catch {
    success = false;
  }

  if (!success) {
    return {
      published: false,
      skippedReason: 'PUBLISHER_FAILED',
      snapshot,
      publishedRevision: metadata.published_revision,
    };
  }

  // Update published_revision in SQLite metadata
  await db.runAsync(
    `UPDATE widget_snapshot_metadata
     SET published_revision = ?,
         updated_at = datetime('now')
     WHERE id = 1 AND published_revision < ?;`,
    snapshot.sourceRevision,
    snapshot.sourceRevision
  );

  return {
    published: true,
    snapshot,
    publishedRevision: snapshot.sourceRevision,
  };
}
