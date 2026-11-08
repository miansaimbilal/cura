import { IDatabase } from '../../db/types';
import { ActionResult, WidgetActionInput } from './types';
import { applyWidgetAction } from './actionService';
import { orchestrateWidgetPublish, WidgetNativePublisher } from './publishOrchestrator';
import { getWidgetSnapshotMetadata } from './snapshotBuilder';
import { clearSnapshots } from '../../../modules/widget-bridge/src';

export interface ParsedWidgetDeepLink {
  actionId: string;
  actionType: string;
  targetId: string;
  requestedState: string;
  userId: string;
  clientActionTime: string;
}

export interface HandleWidgetDeepLinkOptions {
  activeUserId?: string;
  publisher?: WidgetNativePublisher;
  onToast?: (message: string) => void;
}

export interface HandleWidgetDeepLinkResult {
  handled: boolean;
  actionResult?: ActionResult;
  reason?: string;
}

export interface EpochTransitionOptions {
  publisher?: WidgetNativePublisher;
  clearSnapshotsFn?: () => Promise<boolean | void> | boolean | void;
}

export interface EpochTransitionResult {
  userId: string;
  accountEpoch: number;
  sourceRevision: number;
  publishedRevision: number;
}

/**
 * Parses and validates raw URL query parameters for widget action deep links.
 * Returns null if URL is not a widget-action deep link or if required parameters are missing.
 */
export function parseWidgetDeepLink(urlString: string): ParsedWidgetDeepLink | null {
  if (!urlString || typeof urlString !== 'string') return null;
  if (!urlString.startsWith('cura://')) return null;

  try {
    let searchPart = '';
    let hostOrPath = '';

    const qIdx = urlString.indexOf('?');
    if (qIdx !== -1) {
      searchPart = urlString.substring(qIdx + 1);
      hostOrPath = urlString.substring(7, qIdx).replace(/^\/+/, '');
    } else {
      hostOrPath = urlString.substring(7).replace(/^\/+/, '');
    }

    if (hostOrPath !== 'widget-action') {
      return null;
    }

    const searchParams = new URLSearchParams(searchPart);
    const actionId = searchParams.get('action_id');
    const actionType = searchParams.get('action_type');
    const targetId = searchParams.get('target_id');
    const requestedState = searchParams.get('requested_state');
    const userId = searchParams.get('user_id');
    const clientActionTime = searchParams.get('client_action_time');

    if (!actionId || !actionType || !targetId || !requestedState || !userId || !clientActionTime) {
      return null;
    }

    return {
      actionId,
      actionType,
      targetId,
      requestedState,
      userId,
      clientActionTime,
    };
  } catch {
    return null;
  }
}

/**
 * High-level widget action deep-link processor.
 * 1. Parses and validates deep link parameters.
 * 2. Enforces active user authorization.
 * 3. Dispatches mutation through applyWidgetAction.
 * 4. Refreshes widget snapshot if applied or no-op; suppresses refresh on rejection.
 */
export async function handleWidgetDeepLink(
  db: IDatabase,
  urlString: string,
  options: HandleWidgetDeepLinkOptions = {}
): Promise<HandleWidgetDeepLinkResult> {
  const parsed = parseWidgetDeepLink(urlString);
  if (!parsed) {
    console.warn(`[widgetDeepLink] Ignored invalid or incomplete deep link: ${urlString}`);
    return {
      handled: false,
      reason: urlString.includes('action_id=') ? 'MISSING_REQUIRED_PARAMS' : 'MISSING_ACTION_ID',
    };
  }

  // Verify user_id == active session user_id
  let activeUserId = options.activeUserId;
  if (activeUserId === undefined) {
    const meta = await getWidgetSnapshotMetadata(db);
    activeUserId = meta.user_id || 'guest';
  }

  if (parsed.userId !== activeUserId) {
    console.warn(
      `[widgetDeepLink] Action rejected with UNAUTHORIZED: action user ${parsed.userId} != active user ${activeUserId}`
    );
    const rejectedResult: ActionResult = {
      actionId: parsed.actionId,
      status: 'rejected',
      appliedState: null,
      rejectionReason: 'UNAUTHORIZED',
      isDuplicate: false,
    };
    options.onToast?.(`Action failed: ${rejectedResult.rejectionReason}`);
    return {
      handled: true,
      actionResult: rejectedResult,
    };
  }

  // Parse requested_state for mood_log
  if (parsed.actionType === 'mood_log') {
    let parsedMood: any;
    try {
      parsedMood = JSON.parse(parsed.requestedState);
    } catch {
      console.warn(`[widgetDeepLink] Failed to parse mood_log requested_state JSON`);
      const rejectedResult: ActionResult = {
        actionId: parsed.actionId,
        status: 'rejected',
        appliedState: null,
        rejectionReason: 'INVALID_MOOD_TYPE',
        isDuplicate: false,
      };
      options.onToast?.(`Action failed: ${rejectedResult.rejectionReason}`);
      return {
        handled: true,
        actionResult: rejectedResult,
      };
    }

    const moodType = parsedMood?.moodType ?? parsedMood?.mood_type ?? parsedMood?.type;
    if (!moodType || typeof moodType !== 'string') {
      const rejectedResult: ActionResult = {
        actionId: parsed.actionId,
        status: 'rejected',
        appliedState: null,
        rejectionReason: 'INVALID_MOOD_TYPE',
        isDuplicate: false,
      };
      options.onToast?.(`Action failed: ${rejectedResult.rejectionReason}`);
      return {
        handled: true,
        actionResult: rejectedResult,
      };
    }
  }

  // Build canonical WidgetActionInput
  const input: WidgetActionInput = {
    actionId: parsed.actionId,
    userId: parsed.userId,
    actionType: parsed.actionType as any,
    targetId: parsed.targetId,
    requestedState: parsed.requestedState,
    clientActionTime: parsed.clientActionTime,
  };

  // Dispatch action through actionService
  const actionResult = await applyWidgetAction(db, input);

  if (actionResult.status === 'applied' || actionResult.status === 'no_op') {
    // Immediately republish snapshot so widget reflects latest state
    await orchestrateWidgetPublish(db, {
      userId: parsed.userId,
      publisher: options.publisher,
    });
  } else if (actionResult.status === 'rejected') {
    // On rejected (TASK_NOT_FOUND, PAYLOAD_TAMPER_DETECTED, UNAUTHORIZED, INVALID_MOOD_TYPE)
    // Do NOT republish, log and show toast
    console.warn(
      `[widgetDeepLink] Action ${parsed.actionId} rejected: ${actionResult.rejectionReason}`
    );
    options.onToast?.(`Action failed: ${actionResult.rejectionReason}`);
  }

  return {
    handled: true,
    actionResult,
  };
}

/**
 * Transitions account epoch during session changes (login, logout, switch user).
 * Computes new revision in JS first, updates metadata in a transaction,
 * clears old snapshot files, and orchestrates a fresh publication.
 */
export async function transitionAccountEpoch(
  db: IDatabase,
  newUserId: string = 'guest',
  options: EpochTransitionOptions = {}
): Promise<EpochTransitionResult> {
  const targetUserId = newUserId || 'guest';
  let epochResult: EpochTransitionResult = {
    userId: targetUserId,
    accountEpoch: 1,
    sourceRevision: 1,
    publishedRevision: 1,
  };

  await db.withTransactionAsync(async () => {
    const metadata = await getWidgetSnapshotMetadata(db);
    const newRev = metadata.source_revision + 1;
    const newEpoch = metadata.account_epoch + 1;

    // Set source_revision = :newRev and published_revision = :newRev explicitly
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?,
           account_epoch = account_epoch + 1,
           source_revision = ?,
           published_revision = ?,
           updated_at = datetime('now')
       WHERE id = 1;`,
      targetUserId,
      newRev,
      newRev
    );

    epochResult = {
      userId: targetUserId,
      accountEpoch: newEpoch,
      sourceRevision: newRev,
      publishedRevision: newRev,
    };
  });

  // After transaction commits, clear snapshots directory for old epoch
  if (options.clearSnapshotsFn) {
    await options.clearSnapshotsFn();
  } else {
    try {
      await clearSnapshots();
    } catch {
      // Safe fallback if bridge is unavailable in test environment
    }
  }

  // Publish fresh snapshot for the new user/epoch
  await orchestrateWidgetPublish(db, {
    userId: targetUserId,
    force: true,
    publisher: options.publisher,
  });

  return epochResult;
}

/**
 * Migrates guest tasks and mood entries to an authenticated user and transitions account epoch.
 */
export async function migrateGuestDataToUser(
  db: IDatabase,
  newUserId: string,
  options: EpochTransitionOptions = {}
): Promise<EpochTransitionResult> {
  let epochResult: EpochTransitionResult = {
    userId: newUserId,
    accountEpoch: 1,
    sourceRevision: 1,
    publishedRevision: 1,
  };

  await db.withTransactionAsync(async () => {
    // 1. Reassign existing guest records to new user inside same transaction
    await db.runAsync(`UPDATE tasks SET user_id = ? WHERE user_id = 'guest';`, newUserId);
    await db.runAsync(`UPDATE mood_entries SET user_id = ? WHERE user_id = 'guest';`, newUserId);

    // 2. Compute newRev in JS first to guarantee source_revision == published_revision
    const metadata = await getWidgetSnapshotMetadata(db);
    const newRev = metadata.source_revision + 1;
    const newEpoch = metadata.account_epoch + 1;

    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = ?,
           account_epoch = account_epoch + 1,
           source_revision = ?,
           published_revision = ?,
           updated_at = datetime('now')
       WHERE id = 1;`,
      newUserId,
      newRev,
      newRev
    );

    epochResult = {
      userId: newUserId,
      accountEpoch: newEpoch,
      sourceRevision: newRev,
      publishedRevision: newRev,
    };
  });

  // 3. Clear snapshots directory for old epoch
  if (options.clearSnapshotsFn) {
    await options.clearSnapshotsFn();
  } else {
    try {
      await clearSnapshots();
    } catch {
      // Safe fallback
    }
  }

  // 4. Publish clean snapshot for new user
  await orchestrateWidgetPublish(db, {
    userId: newUserId,
    force: true,
    publisher: options.publisher,
  });

  return epochResult;
}
