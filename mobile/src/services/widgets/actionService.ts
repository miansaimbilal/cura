import { IDatabase } from '../../db/types';
import { getTaskById, updateTask } from '../../db/taskRepository';
import { createMoodEntry } from '../../db/moodRepository';
import { TaskStatus } from '../../types/task';
import { MoodType } from '../../types/mood';
import {
  WidgetActionInput,
  ActionResult,
  ProcessedActionRow,
} from './types';

const VALID_MOOD_TYPES = new Set<string>([
  'happy',
  'calm',
  'excited',
  'okay',
  'tired',
  'stressed',
  'sad',
  'anxious',
  'angry',
]);

/**
 * Deterministically constructs a canonical string from action parameters with keys sorted.
 */
export function buildCanonicalActionString(input: {
  actionType: string;
  clientActionTime: string;
  requestedState: string;
  targetId: string;
  userId: string;
}): string {
  return JSON.stringify({
    action_type: input.actionType,
    client_action_time: input.clientActionTime,
    requested_state: input.requestedState,
    target_id: input.targetId,
    user_id: input.userId,
  });
}

/**
 * Computes a SHA-256 hex digest of the canonical action payload.
 * Resolves hashing lazily:
 *   1. If globalThis.crypto and globalThis.crypto.subtle exists, use crypto.subtle.digest('SHA-256', ...)
 *   2. Else try dynamic await import('expo-crypto') and use its digestStringAsync
 *   3. Else use Node node:crypto createHash('sha256')
 */
export async function computePayloadHash(canonicalString: string): Promise<string> {
  // 1. If globalThis.crypto and globalThis.crypto.subtle exists, use crypto.subtle.digest('SHA-256', ...)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 2. Else try dynamic await import('expo-crypto') and use its digestStringAsync
  try {
    const Crypto = await import('expo-crypto');
    if (Crypto && typeof Crypto.digestStringAsync === 'function') {
      return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalString);
    }
  } catch {
    // Fall through to Node fallback
  }

  // 3. Else use Node node:crypto createHash('sha256')
  try {
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(canonicalString).digest('hex');
  } catch {
    throw new Error('No cryptographic SHA-256 digest function available in this runtime');
  }
}

/**
 * Core action application service.
 * Applies a widget action (task_toggle or mood_log) against the processed_actions ledger:
 *   1. Looks up existing receipt by action_id.
 *   2. If hash matches -> returns existing receipt (idempotent duplicate).
 *   3. If hash differs -> rejects with PAYLOAD_TAMPER_DETECTED.
 *   4. If new -> applies mutation via repositories, inserts immutable receipt,
 *      allowing SQLite triggers to atomically advance source_revision.
 */
export async function applyWidgetAction(
  db: IDatabase,
  input: WidgetActionInput
): Promise<ActionResult> {
  // 1. Validate action type
  if (input.actionType !== 'task_toggle' && input.actionType !== 'mood_log') {
    return {
      actionId: input.actionId,
      status: 'rejected',
      appliedState: null,
      rejectionReason: 'INVALID_ACTION_TYPE',
      isDuplicate: false,
    };
  }

  // 2. Compute canonical digest
  const canonicalString = buildCanonicalActionString(input);
  const payloadHash = await computePayloadHash(canonicalString);

  // 3. Check for existing receipt in processed_actions ledger
  const existingReceipt = await db.getFirstAsync<ProcessedActionRow>(
    `SELECT action_id, user_id, action_type, target_id, requested_state, applied_state,
            status, rejection_reason, payload_hash, client_action_time, created_at
     FROM processed_actions
     WHERE action_id = ?;`,
    input.actionId
  );

  if (existingReceipt) {
    if (existingReceipt.payload_hash === payloadHash) {
      // Idempotent duplicate delivery
      return {
        actionId: existingReceipt.action_id,
        status: existingReceipt.status,
        appliedState: existingReceipt.applied_state,
        rejectionReason: existingReceipt.rejection_reason,
        isDuplicate: true,
      };
    } else {
      // Payload conflict / tamper attempt
      return {
        actionId: input.actionId,
        status: 'rejected',
        appliedState: null,
        rejectionReason: 'PAYLOAD_TAMPER_DETECTED',
        isDuplicate: false,
      };
    }
  }

  // 4. Process new action inside an exclusive transaction
  let resultStatus: 'applied' | 'no_op' | 'rejected' = 'rejected';
  let appliedState: string | null = null;
  let rejectionReason: string | null = null;

  await db.withTransactionAsync(async () => {
    if (input.actionType === 'task_toggle') {
      const task = await getTaskById(db, input.targetId);

      if (!task || task.isDeleted) {
        resultStatus = 'rejected';
        rejectionReason = 'TASK_NOT_FOUND';
      } else if (task.userId !== input.userId) {
        resultStatus = 'rejected';
        rejectionReason = 'UNAUTHORIZED';
      } else {
        // Parse requested target status if specified
        let targetStatus: TaskStatus | 'toggle' = 'toggle';
        try {
          const parsed = JSON.parse(input.requestedState);
          if (parsed && typeof parsed.targetStatus === 'string') {
            targetStatus = parsed.targetStatus as TaskStatus;
          } else if (parsed && typeof parsed.status === 'string') {
            targetStatus = parsed.status as TaskStatus;
          }
        } catch {
          if (input.requestedState === 'completed' || input.requestedState === 'pending') {
            targetStatus = input.requestedState as TaskStatus;
          }
        }

        if (targetStatus !== 'toggle' && task.status === targetStatus) {
          // Already matches requested status -> durable no-op
          resultStatus = 'no_op';
          appliedState = JSON.stringify({ status: task.status });
        } else {
          const nextStatus: TaskStatus = targetStatus === 'toggle'
            ? (task.status === 'completed' ? 'pending' : 'completed')
            : targetStatus;
          const isCompleted = nextStatus === 'completed';
          const now = input.clientActionTime || new Date().toISOString();

          const updated = await updateTask(
            db,
            task.id,
            {
              status: nextStatus,
              completedAt: isCompleted ? now : null,
            },
            {
              action: isCompleted ? 'completed' : 'uncompleted',
              details: isCompleted ? 'Marked complete via widget' : 'Marked incomplete via widget',
            }
          );

          resultStatus = 'applied';
          appliedState = JSON.stringify({
            status: updated.status,
            completedAt: updated.completedAt,
          });
        }
      }
    } else if (input.actionType === 'mood_log') {
      let targetMoodType: string | null = null;
      try {
        const parsed = JSON.parse(input.requestedState);
        targetMoodType = parsed?.moodType || parsed?.mood_type || null;
      } catch {
        targetMoodType = input.requestedState;
      }

      if (!targetMoodType || !VALID_MOOD_TYPES.has(targetMoodType)) {
        resultStatus = 'rejected';
        rejectionReason = 'INVALID_MOOD_TYPE';
      } else {
        const newMood = await createMoodEntry(db, {
          userId: input.userId,
          moodType: targetMoodType as MoodType,
          loggedAt: input.clientActionTime || new Date().toISOString(),
          note: 'Logged from widget',
        });

        resultStatus = 'applied';
        appliedState = JSON.stringify({
          id: newMood.id,
          moodType: newMood.moodType,
          loggedAt: newMood.loggedAt,
        });
      }
    }

    // Insert durable receipt into processed_actions
    await db.runAsync(
      `INSERT INTO processed_actions (
        action_id, user_id, action_type, target_id, requested_state, applied_state,
        status, rejection_reason, payload_hash, client_action_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
      input.actionId,
      input.userId,
      input.actionType,
      input.targetId,
      input.requestedState,
      appliedState,
      resultStatus,
      rejectionReason,
      payloadHash,
      input.clientActionTime
    );
  });

  return {
    actionId: input.actionId,
    status: resultStatus,
    appliedState,
    rejectionReason,
    isDuplicate: false,
  };
}
