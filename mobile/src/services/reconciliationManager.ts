import { AppState, AppStateStatus } from 'react-native';
import { reconcileCheckinNotifications } from './checkinScheduler';

let isReconciling = false;
let pendingReconcile = false;
let lastKnownTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let lastKnownOffset = new Date().getTimezoneOffset();
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Calculates milliseconds until 5 seconds after the next local midnight,
 * providing a safe rollover buffer.
 */
export function getMsUntilNextMidnight(referenceDate: Date = new Date()): number {
  const nextMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + 1,
    0,
    0,
    5,
    0
  );
  return Math.max(1000, nextMidnight.getTime() - referenceDate.getTime());
}

/**
 * Safe, debounced trigger for notification reconciliation that prevents concurrent runs.
 */
export async function triggerReconciliation(reason = 'unknown'): Promise<void> {
  if (isReconciling) {
    pendingReconcile = true;
    return;
  }

  isReconciling = true;
  try {
    await reconcileCheckinNotifications();
  } catch (err) {
    console.warn(`[ReconciliationManager] Reconciliation failed (${reason}):`, err);
  } finally {
    isReconciling = false;
    if (pendingReconcile) {
      pendingReconcile = false;
      triggerReconciliation('pending_queued');
    }
  }
}

/**
 * Checks whether the device timezone or UTC offset has changed.
 */
export function hasTimezoneChanged(): boolean {
  const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentOffset = new Date().getTimezoneOffset();

  if (currentTimezone !== lastKnownTimezone || currentOffset !== lastKnownOffset) {
    lastKnownTimezone = currentTimezone;
    lastKnownOffset = currentOffset;
    return true;
  }
  return false;
}

/**
 * Schedules a one-shot timer for the next local midnight rollover.
 */
function scheduleMidnightRollover(): void {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }

  const ms = getMsUntilNextMidnight();
  midnightTimer = setTimeout(() => {
    triggerReconciliation('midnight_rollover');
    // Schedule for the subsequent midnight
    scheduleMidnightRollover();
  }, ms);
}

/**
 * Sets up all 6 required notification reconciliation triggers:
 * 1. Cold app launch
 * 2. App foreground resume
 * 3. Preference changes (called via triggerReconciliation or reconcileCheckinNotifications)
 * 4. Notification permission state changes (re-evaluated on active resume)
 * 5. Device timezone changes (detected on active resume)
 * 6. Midnight rollover while app remains active (midnight rollover timer)
 *
 * Returns a teardown function for clean lifecycle unmounting.
 */
export function setupReconciliationManager(): () => void {
  // 1. Cold app launch trigger
  triggerReconciliation('cold_launch');

  // Schedule midnight rollover timer
  scheduleMidnightRollover();

  // 2, 4, 5. AppState resume listener (handles foreground resume, permission change, and timezone change)
  const appStateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      const tzChanged = hasTimezoneChanged();
      const reason = tzChanged ? 'timezone_change' : 'app_resume';

      // Reset midnight rollover timer relative to fresh active state
      scheduleMidnightRollover();

      await triggerReconciliation(reason);
    }
  });

  return () => {
    if (midnightTimer) {
      clearTimeout(midnightTimer);
      midnightTimer = null;
    }
    appStateSub.remove();
  };
}

export const __reconciliationTestHelpers = {
  resetState: () => {
    isReconciling = false;
    pendingReconcile = false;
    if (midnightTimer) {
      clearTimeout(midnightTimer);
      midnightTimer = null;
    }
  },
  setTimezone: (tz: string, offset: number) => {
    lastKnownTimezone = tz;
    lastKnownOffset = offset;
  },
  hasActiveMidnightTimer: () => midnightTimer !== null,
};
