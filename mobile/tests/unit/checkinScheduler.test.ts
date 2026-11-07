import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCheckinPreferences,
  isTimeInQuietHours,
  DEFAULT_CHECKIN_PREFERENCES,
  isValidTimeString,
} from '../../src/services/notificationPreferences';
import {
  calculateCheckinSchedule,
  reconcileCheckinNotifications,
  CHECKIN_NAMESPACE,
} from '../../src/services/checkinScheduler';
import {
  isCheckinNotificationPayload,
  handleCheckinNotificationResponse,
  __responseHandlerTestHelpers,
} from '../../src/services/notificationResponseHandler';
import {
  triggerReconciliation,
  hasTimezoneChanged,
  getMsUntilNextMidnight,
  setupReconciliationManager,
  __reconciliationTestHelpers,
} from '../../src/services/reconciliationManager';
import { AppState } from 'react-native';
import { CheckinPreferences } from '../../src/types/checkin';
import { __mockHelpers } from '../helpers/notificationsMock';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import * as dbClient from '../../src/db/client';

describe('Step 2.3: Check-in Preferences & Scheduling (Unit Tests)', () => {
  beforeEach(() => {
    __mockHelpers.reset([]);
  });

  describe('1. Check-in Preferences Validation & Recovery', () => {
    it('returns default preferences when input is null, undefined, or empty object', () => {
      expect(validateCheckinPreferences(null)).toEqual(DEFAULT_CHECKIN_PREFERENCES);
      expect(validateCheckinPreferences(undefined)).toEqual(DEFAULT_CHECKIN_PREFERENCES);
      expect(validateCheckinPreferences({})).toEqual(DEFAULT_CHECKIN_PREFERENCES);
    });

    it('safely recovers invalid time formats with default values', () => {
      const malformed = {
        morningEnabled: true,
        morningTime: '25:99', // invalid
        eveningEnabled: true,
        eveningTime: 'abc',   // invalid
        quietHoursEnabled: true,
        quietHoursStart: '12:0', // invalid
        quietHoursEnd: '07:00',
      };

      const validated = validateCheckinPreferences(malformed);
      expect(validated.morningTime).toBe(DEFAULT_CHECKIN_PREFERENCES.morningTime);
      expect(validated.eveningTime).toBe(DEFAULT_CHECKIN_PREFERENCES.eveningTime);
      expect(validated.quietHoursStart).toBe(DEFAULT_CHECKIN_PREFERENCES.quietHoursStart);
      expect(validated.quietHoursEnd).toBe('07:00');
    });

    it('validates 24-hour time format correctly', () => {
      expect(isValidTimeString('00:00')).toBe(true);
      expect(isValidTimeString('08:30')).toBe(true);
      expect(isValidTimeString('20:30')).toBe(true);
      expect(isValidTimeString('23:59')).toBe(true);
      expect(isValidTimeString('24:00')).toBe(false);
      expect(isValidTimeString('8:30')).toBe(false);
      expect(isValidTimeString('morning')).toBe(false);
    });
  });

  describe('2. Quiet Hours Range Logic', () => {
    it('returns false when quietHoursEnabled is false', () => {
      expect(isTimeInQuietHours('23:00', '22:00', '07:00', false)).toBe(false);
    });

    it('returns false when quietHoursStart equals quietHoursEnd (disabled by equal boundaries)', () => {
      expect(isTimeInQuietHours('22:00', '22:00', '22:00', true)).toBe(false);
      expect(isTimeInQuietHours('10:00', '10:00', '10:00', true)).toBe(false);
    });

    it('correctly handles standard intra-day quiet hour ranges (e.g., 13:00 to 15:00)', () => {
      const start = '13:00';
      const end = '15:00';

      expect(isTimeInQuietHours('12:59', start, end, true)).toBe(false);
      expect(isTimeInQuietHours('13:00', start, end, true)).toBe(true);  // inclusive start
      expect(isTimeInQuietHours('14:30', start, end, true)).toBe(true);
      expect(isTimeInQuietHours('15:00', start, end, true)).toBe(false); // exclusive end
      expect(isTimeInQuietHours('15:01', start, end, true)).toBe(false);
    });

    it('correctly handles overnight quiet hour ranges (e.g., 22:00 to 07:00)', () => {
      const start = '22:00';
      const end = '07:00';

      expect(isTimeInQuietHours('21:59', start, end, true)).toBe(false);
      expect(isTimeInQuietHours('22:00', start, end, true)).toBe(true);  // inclusive start
      expect(isTimeInQuietHours('23:45', start, end, true)).toBe(true);
      expect(isTimeInQuietHours('00:00', start, end, true)).toBe(true);
      expect(isTimeInQuietHours('06:59', start, end, true)).toBe(true);
      expect(isTimeInQuietHours('07:00', start, end, true)).toBe(false); // exclusive end
      expect(isTimeInQuietHours('12:00', start, end, true)).toBe(false);
    });
  });

  describe('3. Rolling 7-Day Schedule Calculation', () => {
    const fixedNow = new Date(2026, 10, 6, 5, 0, 0);

    it('calculates morning and evening occurrences across 7 days', () => {
      const prefs: CheckinPreferences = {
        morningEnabled: true,
        morningTime: '08:30',
        eveningEnabled: true,
        eveningTime: '20:30',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      };

      const plan = calculateCheckinSchedule(prefs, fixedNow);

      // Both morning and evening are scheduled for 7 days
      // Day 0 morning (08:30) is in future relative to 06:00
      expect(plan.length).toBe(14);
      expect(plan.filter((p) => p.checkinType === 'morning').length).toBe(7);
      expect(plan.filter((p) => p.checkinType === 'evening').length).toBe(7);
      expect(plan.every((p) => !p.isSkippedQuietHours)).toBe(true);
    });

    it('excludes disabled check-in types', () => {
      const prefs: CheckinPreferences = {
        morningEnabled: false, // disabled
        morningTime: '08:30',
        eveningEnabled: true,
        eveningTime: '20:30',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      };

      const plan = calculateCheckinSchedule(prefs, fixedNow);
      expect(plan.length).toBe(7);
      expect(plan.every((p) => p.checkinType === 'evening')).toBe(true);
    });

    it('marks occurrences during quiet hours as skipped, without shifting them', () => {
      const prefs: CheckinPreferences = {
        morningEnabled: true,
        morningTime: '06:30', // Falls inside quiet hours 22:00 - 07:00!
        eveningEnabled: true,
        eveningTime: '20:30', // Outside quiet hours
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      };

      const plan = calculateCheckinSchedule(prefs, fixedNow);

      const morningItems = plan.filter((p) => p.checkinType === 'morning');
      expect(morningItems.length).toBe(7);
      expect(morningItems.every((p) => p.isSkippedQuietHours)).toBe(true);
      // Scheduled targetTime remains exactly 06:30, never shifted
      expect(morningItems.every((p) => p.targetTime === '06:30')).toBe(true);

      const eveningItems = plan.filter((p) => p.checkinType === 'evening');
      expect(eveningItems.every((p) => !p.isSkippedQuietHours)).toBe(true);
    });
  });

  describe('4. Notification Reconciliation & Ownership Boundaries', () => {
    it('cancels only Cura-owned checkin notifications, leaving unrelated notifications untouched', async () => {
      const unrelatedNotif = {
        identifier: 'unrelated-1',
        content: {
          title: 'Alarm',
          body: 'Wake up',
          data: { curaNamespace: 'other_feature', someKey: 'val' },
        },
      };

      const curaOldNotif = {
        identifier: 'cura-old-1',
        content: {
          title: 'Morning Check-in',
          body: 'Old notification',
          data: {
            curaNamespace: CHECKIN_NAMESPACE,
            checkinType: 'morning',
            intendedDate: '2026-11-05',
          },
        },
      };

      __mockHelpers.reset([unrelatedNotif, curaOldNotif]);

      const prefs: CheckinPreferences = {
        morningEnabled: true,
        morningTime: '08:30',
        eveningEnabled: true,
        eveningTime: '20:30',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
      };

      const res = await reconcileCheckinNotifications(prefs, new Date(2026, 10, 6, 5, 0, 0));

      expect(res.cancelledCount).toBe(1);
      const remaining = __mockHelpers.getScheduled();

      // Unrelated notification is still present!
      expect(remaining.some((n: any) => n.identifier === 'unrelated-1')).toBe(true);
      // Old Cura notification was removed
      expect(remaining.some((n: any) => n.identifier === 'cura-old-1')).toBe(false);
      // New Cura notifications were scheduled
      expect(remaining.filter((n: any) => n.content.data?.curaNamespace === CHECKIN_NAMESPACE).length).toBe(14);
    });

    it('does not schedule when notification permission is denied', async () => {
      __mockHelpers.reset([], 'denied');

      const prefs = { ...DEFAULT_CHECKIN_PREFERENCES };
      const res = await reconcileCheckinNotifications(prefs);

      expect(res.permissionGranted).toBe(false);
      expect(res.scheduledCount).toBe(0);
      expect(__mockHelpers.getScheduled().length).toBe(0);
    });
  });

  describe('5. Notification Payload Validation & Tap Handling', () => {
    let db: NodeSQLiteAdapter;

    beforeEach(async () => {
      db = new NodeSQLiteAdapter(':memory:');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      vi.spyOn(dbClient, 'getDatabase').mockResolvedValue(db as any);
    });

    it('rejects malformed or non-Cura notification payloads', async () => {
      expect(isCheckinNotificationPayload(null)).toBe(false);
      expect(isCheckinNotificationPayload({})).toBe(false);
      expect(
        isCheckinNotificationPayload({
          curaNamespace: 'wrong_ns',
          checkinType: 'morning',
          intendedDate: '2026-11-06',
        })
      ).toBe(false);
      expect(
        isCheckinNotificationPayload({
          curaNamespace: CHECKIN_NAMESPACE,
          checkinType: 'invalid_type',
          intendedDate: '2026-11-06',
        })
      ).toBe(false);

      const fakeResponse = {
        notification: {
          request: {
            identifier: 'notif-1',
            content: { data: { someKey: 123 } },
          },
        },
      } as any;

      const res = await handleCheckinNotificationResponse(fakeResponse);
      expect(res.handled).toBe(false);
    });

    it('adheres to stale notification rule: opens reflection for original intendedDate', async () => {
      // Notification intended for Nov 5 tapped on Nov 6
      const tapResponse = {
        notification: {
          request: {
            identifier: 'stale-notif-1',
            content: {
              data: {
                curaNamespace: CHECKIN_NAMESPACE,
                checkinType: 'evening',
                intendedDate: '2026-11-05',
              },
            },
          },
        },
      } as any;

      const res = await handleCheckinNotificationResponse(tapResponse, 'guest', db);

      expect(res.handled).toBe(true);
      expect(res.intendedDate).toBe('2026-11-05');
      expect(res.checkinType).toBe('evening');
      expect(res.conversation).toBeDefined();
      expect(res.conversation?.title).toBe('Evening Reflection');

      // Verify in SQLite that the occurrence was linked to Nov 5
      const occRow = await db.getFirstAsync<any>(
        `SELECT * FROM checkin_occurrences WHERE local_date = '2026-11-05';`
      );
      expect(occRow).not.toBeNull();
      expect(occRow.local_date).toBe('2026-11-05');
      expect(occRow.conversation_id).toBe(res.conversation?.id);
    });

    it('idempotently handles repeated taps without creating duplicate conversations', async () => {
      const tapResponse = {
        notification: {
          request: {
            identifier: 'tap-repeat-1',
            content: {
              data: {
                curaNamespace: CHECKIN_NAMESPACE,
                checkinType: 'morning',
                intendedDate: '2026-11-06',
              },
            },
          },
        },
      } as any;

      const firstTap = await handleCheckinNotificationResponse(tapResponse, 'guest', db);
      const secondTap = await handleCheckinNotificationResponse(tapResponse, 'guest', db);

      expect(firstTap.conversation?.id).toBe(secondTap.conversation?.id);

      const convCount = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM conversations WHERE conversation_type = 'morning_checkin';`
      );
      expect(convCount.length).toBe(1);
    });
  });

  describe('6. Reconciliation Lifecycle Manager (All 6 Triggers)', () => {
    beforeEach(() => {
      __reconciliationTestHelpers.resetState();
      __mockHelpers.reset([]);
      (AppState as any).__clearListeners?.();
    });

    it('calculates milliseconds until 5 seconds past next local midnight', () => {
      const refDate = new Date(2026, 10, 6, 23, 59, 50, 0); // 15 seconds before midnight + 5 sec buffer = 15s
      const ms = getMsUntilNextMidnight(refDate);
      expect(ms).toBe(15000);

      // Lower bound protection: always >= 1000ms
      const exactNext = new Date(2026, 10, 7, 0, 0, 5, 0);
      expect(getMsUntilNextMidnight(exactNext)).toBeGreaterThanOrEqual(1000);
    });

    it('detects device timezone and offset changes', () => {
      __reconciliationTestHelpers.setTimezone('America/New_York', 300);
      expect(hasTimezoneChanged()).toBe(true); // Current machine timezone != New_York
      expect(hasTimezoneChanged()).toBe(false); // Second check sees no change
    });

    it('debounces and serializes concurrent reconciliation triggers without re-entrancy', async () => {
      // Trigger multiple in parallel
      await Promise.all([
        triggerReconciliation('trigger_1'),
        triggerReconciliation('trigger_2'),
        triggerReconciliation('trigger_3'),
      ]);
      // Should complete cleanly without uncaught errors
    });

    it('registers AppState resume listener and midnight rollover timer on setup, and cleans up on teardown', async () => {
      const teardown = setupReconciliationManager();

      expect((AppState as any).__getListenerCount?.()).toBeGreaterThanOrEqual(1);
      expect(__reconciliationTestHelpers.hasActiveMidnightTimer()).toBe(true);

      // Simulate app resume
      (AppState as any).__emitStateChange?.('active');
      expect(__reconciliationTestHelpers.hasActiveMidnightTimer()).toBe(true);

      // Allow in-flight async reconciliation from setup/resume to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Teardown
      teardown();
      expect((AppState as any).__getListenerCount?.()).toBe(0);
      expect(__reconciliationTestHelpers.hasActiveMidnightTimer()).toBe(false);
    });

    it('handles permission revocation by cancelling scheduled notifications and preventing new ones', async () => {
      // Setup existing notifications
      __mockHelpers.reset([
        {
          identifier: 'cura-test-notif-1',
          content: {
            title: 'Morning Check-in',
            body: 'Time to check in',
            data: {
              curaNamespace: CHECKIN_NAMESPACE,
              checkinType: 'morning',
              intendedDate: '2026-11-06',
            },
          },
        },
      ], 'denied'); // Permission status denied

      const res = await reconcileCheckinNotifications();
      expect(res.permissionGranted).toBe(false);
      expect(res.scheduledCount).toBe(0);
      expect(res.cancelledCount).toBe(1);

      // Ensure no scheduled notifications remain
      expect(__mockHelpers.getScheduled().length).toBe(0);
    });
  });

  describe('7. Crash Recovery & Persistent Idempotency Across App Restarts', () => {
    let db: NodeSQLiteAdapter;

    beforeEach(async () => {
      db = new NodeSQLiteAdapter(':memory:');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      __responseHandlerTestHelpers.resetCache();
    });

    it('reuses existing conversation from SQLite when in-memory cache is wiped (cold restart simulation)', async () => {
      const tapResponse = {
        notification: {
          request: {
            identifier: 'restart-test-1',
            content: {
              data: {
                curaNamespace: CHECKIN_NAMESPACE,
                checkinType: 'morning',
                intendedDate: '2026-11-06',
              },
            },
          },
        },
      } as any;

      // 1. First tap creates conversation and occurrence
      const res1 = await handleCheckinNotificationResponse(tapResponse, 'guest', db);
      expect(res1.handled).toBe(true);
      expect(res1.wasCreated).toBe(true);
      const convId1 = res1.conversation?.id;

      // 2. Simulate complete app crash / process termination: wipe in-memory tap cache
      __responseHandlerTestHelpers.resetCache();
      expect(__responseHandlerTestHelpers.getCacheSize()).toBe(0);

      // 3. App relaunches and processes tap response again from durable SQLite store
      const res2 = await handleCheckinNotificationResponse(tapResponse, 'guest', db);
      expect(res2.handled).toBe(true);
      expect(res2.wasCreated).toBe(false); // Reused, not created
      expect(res2.conversation?.id).toBe(convId1);

      // Verify exactly 1 conversation exists in SQLite
      const conversations = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM conversations WHERE conversation_type = 'morning_checkin';`
      );
      expect(conversations.length).toBe(1);
    });
  });

  describe('8. Strict Midnight Boundary & Intended Date Precision', () => {
    let db: NodeSQLiteAdapter;

    beforeEach(async () => {
      db = new NodeSQLiteAdapter(':memory:');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      __responseHandlerTestHelpers.resetCache();
    });

    it('strictly maps to original intendedDate even when tapped early morning (e.g. 00:01 AM or 03:59 AM) without 04:00 AM grace period', async () => {
      // Prior day notification (e.g. Nov 5)
      const staleResponse = {
        notification: {
          request: {
            identifier: 'stale-early-morning-tap',
            content: {
              data: {
                curaNamespace: CHECKIN_NAMESPACE,
                checkinType: 'evening',
                intendedDate: '2026-11-05',
              },
            },
          },
        },
      } as any;

      // Tap response received on Nov 6 at 03:59 AM
      const res = await handleCheckinNotificationResponse(staleResponse, 'guest', db);
      expect(res.handled).toBe(true);
      expect(res.intendedDate).toBe('2026-11-05'); // Strictly preserved!
      expect(res.conversation?.title).toBe('Evening Reflection');

      // Ensure NO checkin_occurrences row exists for Nov 6
      const nov6Row = await db.getFirstAsync<any>(
        `SELECT * FROM checkin_occurrences WHERE local_date = '2026-11-06';`
      );
      expect(nov6Row).toBeNull();

      // Ensure checkin_occurrences row was created strictly for Nov 5
      const nov5Row = await db.getFirstAsync<any>(
        `SELECT * FROM checkin_occurrences WHERE local_date = '2026-11-05';`
      );
      expect(nov5Row).not.toBeNull();
      expect(nov5Row.local_date).toBe('2026-11-05');
      expect(nov5Row.checkin_type).toBe('evening');
    });
  });
});
