import * as Notifications from 'expo-notifications';
import { CheckinType, CheckinPreferences } from '../types/checkin';
import {
  getCheckinPreferences,
  isTimeInQuietHours,
} from './notificationPreferences';
import { getLocalDateString } from '../utils/date';

export const CHECKIN_NAMESPACE = 'checkin_scheduler';

export interface CheckinNotificationPayload {
  curaNamespace: typeof CHECKIN_NAMESPACE;
  checkinType: CheckinType;
  intendedDate: string; // "YYYY-MM-DD"
}

export interface ScheduledCheckinPlanItem {
  checkinType: CheckinType;
  intendedDate: string;
  targetTime: string;
  targetDate: Date;
  title: string;
  body: string;
  isSkippedQuietHours: boolean;
}

/**
 * Configure global foreground notification behavior for Cura.
 */
export function configureNotificationHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Graceful fallback for non-native environments (e.g., node / vitest)
  }
}

/**
 * Pure calculation of the rolling 7-day one-shot schedule.
 * Computes check-in occurrences for day offsets 0 through 6.
 * Honors:
 * - morningEnabled / eveningEnabled toggles
 * - Future timestamps only
 * - Quiet hours suppression (items falling inside quiet hours are marked skipped, never shifted)
 */
export function calculateCheckinSchedule(
  preferences: CheckinPreferences,
  referenceDate: Date = new Date()
): ScheduledCheckinPlanItem[] {
  const plan: ScheduledCheckinPlanItem[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const calendarDate = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() + dayOffset
    );
    const localDateStr = getLocalDateString(calendarDate);

    // 1. Morning Check-in
    if (preferences.morningEnabled) {
      const [mH, mM] = preferences.morningTime.split(':').map(Number);
      const targetDate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth(),
        calendarDate.getDate(),
        mH,
        mM,
        0,
        0
      );

      // Only schedule if target is in the future
      if (targetDate.getTime() > referenceDate.getTime()) {
        const inQuiet = isTimeInQuietHours(
          preferences.morningTime,
          preferences.quietHoursStart,
          preferences.quietHoursEnd,
          preferences.quietHoursEnabled
        );

        plan.push({
          checkinType: 'morning',
          intendedDate: localDateStr,
          targetTime: preferences.morningTime,
          targetDate,
          title: 'Morning Check-in',
          body: 'Start your day with calm clarity. Take a minute to check in with Cura.',
          isSkippedQuietHours: inQuiet,
        });
      }
    }

    // 2. Evening Reflection
    if (preferences.eveningEnabled) {
      const [eH, eM] = preferences.eveningTime.split(':').map(Number);
      const targetDate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth(),
        calendarDate.getDate(),
        eH,
        eM,
        0,
        0
      );

      // Only schedule if target is in the future
      if (targetDate.getTime() > referenceDate.getTime()) {
        const inQuiet = isTimeInQuietHours(
          preferences.eveningTime,
          preferences.quietHoursStart,
          preferences.quietHoursEnd,
          preferences.quietHoursEnabled
        );

        plan.push({
          checkinType: 'evening',
          intendedDate: localDateStr,
          targetTime: preferences.eveningTime,
          targetDate,
          title: 'Evening Reflection',
          body: 'Unwind and reflect on your day with Cura.',
          isSkippedQuietHours: inQuiet,
        });
      }
    }
  }

  return plan;
}

export interface ReconcileResult {
  scheduledCount: number;
  skippedQuietHoursCount: number;
  cancelledCount: number;
  permissionGranted: boolean;
}

/**
 * Reconciles scheduled local check-in notifications against current preferences.
 * - Only cancels and schedules notifications tagged with curaNamespace: 'checkin_scheduler'.
 * - Preserves all unrelated application notifications.
 * - Suppresses occurrences during quiet hours without shifting.
 */
export async function reconcileCheckinNotifications(
  customPreferences?: CheckinPreferences,
  referenceDate: Date = new Date()
): Promise<ReconcileResult> {
  const preferences = customPreferences ?? (await getCheckinPreferences());

  // 1. Verify notification permission
  let permissionGranted = false;
  try {
    const existingPerm = await Notifications.getPermissionsAsync();
    if (existingPerm.status === 'granted') {
      permissionGranted = true;
    } else {
      const requested = await Notifications.requestPermissionsAsync();
      permissionGranted = requested.status === 'granted';
    }
  } catch (err) {
    console.warn('[CheckinScheduler] Failed to check/request notification permissions', err);
    return {
      scheduledCount: 0,
      skippedQuietHoursCount: 0,
      cancelledCount: 0,
      permissionGranted: false,
    };
  }

  if (!permissionGranted) {
    // If permission was revoked or denied, cancel any previously scheduled Cura notifications
    let cancelledCount = 0;
    try {
      const scheduledList = await Notifications.getAllScheduledNotificationsAsync();
      for (const notif of scheduledList) {
        if (notif?.content?.data?.curaNamespace === CHECKIN_NAMESPACE) {
          try {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
            cancelledCount++;
          } catch (err) {
            console.warn('[CheckinScheduler] Failed to cancel scheduled notification on permission revocation', notif.identifier, err);
          }
        }
      }
    } catch (err) {
      console.warn('[CheckinScheduler] Failed to fetch scheduled notifications on permission revocation', err);
    }

    return {
      scheduledCount: 0,
      skippedQuietHoursCount: 0,
      cancelledCount,
      permissionGranted: false,
    };
  }

  // 2. Fetch all scheduled notifications
  let scheduledList: Notifications.NotificationRequest[] = [];
  try {
    scheduledList = await Notifications.getAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[CheckinScheduler] Failed to get scheduled notifications', err);
  }

  // 3. Cancel ONLY Cura checkin notifications
  let cancelledCount = 0;
  for (const notif of scheduledList) {
    const data = notif.content?.data as CheckinNotificationPayload | undefined;
    if (data?.curaNamespace === CHECKIN_NAMESPACE) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        cancelledCount++;
      } catch (err) {
        console.warn('[CheckinScheduler] Failed to cancel scheduled notification', notif.identifier, err);
      }
    }
  }

  // 4. Calculate 7-day rolling plan
  const plan = calculateCheckinSchedule(preferences, referenceDate);
  let scheduledCount = 0;
  let skippedQuietHoursCount = 0;

  // 5. Schedule one-shot notifications for un-suppressed occurrences
  for (const item of plan) {
    if (item.isSkippedQuietHours) {
      skippedQuietHoursCount++;
      continue;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title,
          body: item.body,
          data: {
            curaNamespace: CHECKIN_NAMESPACE,
            checkinType: item.checkinType,
            intendedDate: item.intendedDate,
          } satisfies CheckinNotificationPayload,
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.targetDate,
        },
      });
      scheduledCount++;
    } catch (err) {
      console.warn('[CheckinScheduler] Failed to schedule notification', item, err);
    }
  }

  return {
    scheduledCount,
    skippedQuietHoursCount,
    cancelledCount,
    permissionGranted,
  };
}
