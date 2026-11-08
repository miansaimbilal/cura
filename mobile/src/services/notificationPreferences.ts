import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckinPreferences } from '../types/checkin';

export const NOTIFICATION_PREFERENCES_KEY = '@cura_notification_preferences';
export const CHECKIN_PREFERENCES_KEY = '@cura_checkin_preferences';

export interface NotificationPreferences {
  // 1. Timed task reminders (SPEC §11 category 1)
  timedTaskReminders: boolean;

  // 2. End-of-day task reminders (SPEC §11 category 2)
  endOfDayReminders: boolean;
  endOfDayTime: string;

  // 3. Morning AI check-in (SPEC §11 category 3)
  morningCheckin: boolean;
  morningTime: string;

  // 4. Evening AI check-in (SPEC §11 category 4)
  eveningCheckin: boolean;
  eveningTime: string;

  // 5. Accomplishment notifications (SPEC §11 category 5)
  accomplishments: boolean;

  // 6. AI insight notifications (SPEC §11 category 6)
  aiInsights: boolean;

  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  timedTaskReminders: true,
  endOfDayReminders: true,
  endOfDayTime: '21:00',
  morningCheckin: true,
  morningTime: '08:30',
  eveningCheckin: true,
  eveningTime: '20:30',
  accomplishments: true,
  aiInsights: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const DEFAULT_CHECKIN_PREFERENCES: CheckinPreferences = {
  morningEnabled: true,
  morningTime: '08:30',
  eveningEnabled: true,
  eveningTime: '20:30',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeString(time: any): boolean {
  return typeof time === 'string' && TIME_REGEX.test(time);
}

/**
 * Validates a notification preferences object, safely falling back to defaults for invalid fields.
 */
export function validateNotificationPreferences(raw: any): NotificationPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    timedTaskReminders:
      typeof raw.timedTaskReminders === 'boolean'
        ? raw.timedTaskReminders
        : DEFAULT_NOTIFICATION_PREFERENCES.timedTaskReminders,
    endOfDayReminders:
      typeof raw.endOfDayReminders === 'boolean'
        ? raw.endOfDayReminders
        : DEFAULT_NOTIFICATION_PREFERENCES.endOfDayReminders,
    endOfDayTime: isValidTimeString(raw.endOfDayTime)
      ? raw.endOfDayTime
      : DEFAULT_NOTIFICATION_PREFERENCES.endOfDayTime,
    morningCheckin:
      typeof raw.morningCheckin === 'boolean'
        ? raw.morningCheckin
        : typeof raw.morningEnabled === 'boolean'
          ? raw.morningEnabled
          : DEFAULT_NOTIFICATION_PREFERENCES.morningCheckin,
    morningTime: isValidTimeString(raw.morningTime)
      ? raw.morningTime
      : DEFAULT_NOTIFICATION_PREFERENCES.morningTime,
    eveningCheckin:
      typeof raw.eveningCheckin === 'boolean'
        ? raw.eveningCheckin
        : typeof raw.eveningEnabled === 'boolean'
          ? raw.eveningEnabled
          : DEFAULT_NOTIFICATION_PREFERENCES.eveningCheckin,
    eveningTime: isValidTimeString(raw.eveningTime)
      ? raw.eveningTime
      : DEFAULT_NOTIFICATION_PREFERENCES.eveningTime,
    accomplishments:
      typeof raw.accomplishments === 'boolean'
        ? raw.accomplishments
        : DEFAULT_NOTIFICATION_PREFERENCES.accomplishments,
    aiInsights:
      typeof raw.aiInsights === 'boolean'
        ? raw.aiInsights
        : DEFAULT_NOTIFICATION_PREFERENCES.aiInsights,
    quietHoursEnabled:
      typeof raw.quietHoursEnabled === 'boolean'
        ? raw.quietHoursEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnabled,
    quietHoursStart: isValidTimeString(raw.quietHoursStart)
      ? raw.quietHoursStart
      : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursStart,
    quietHoursEnd: isValidTimeString(raw.quietHoursEnd)
      ? raw.quietHoursEnd
      : DEFAULT_NOTIFICATION_PREFERENCES.quietHoursEnd,
  };
}

/**
 * Validates checkin preferences for backward compatibility with checkinScheduler.
 */
export function validateCheckinPreferences(raw: any): CheckinPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHECKIN_PREFERENCES };
  }

  return {
    morningEnabled:
      typeof raw.morningEnabled === 'boolean'
        ? raw.morningEnabled
        : typeof raw.morningCheckin === 'boolean'
          ? raw.morningCheckin
          : DEFAULT_CHECKIN_PREFERENCES.morningEnabled,
    morningTime: isValidTimeString(raw.morningTime)
      ? raw.morningTime
      : DEFAULT_CHECKIN_PREFERENCES.morningTime,
    eveningEnabled:
      typeof raw.eveningEnabled === 'boolean'
        ? raw.eveningEnabled
        : typeof raw.eveningCheckin === 'boolean'
          ? raw.eveningCheckin
          : DEFAULT_CHECKIN_PREFERENCES.eveningEnabled,
    eveningTime: isValidTimeString(raw.eveningTime)
      ? raw.eveningTime
      : DEFAULT_CHECKIN_PREFERENCES.eveningTime,
    quietHoursEnabled:
      typeof raw.quietHoursEnabled === 'boolean'
        ? raw.quietHoursEnabled
        : DEFAULT_CHECKIN_PREFERENCES.quietHoursEnabled,
    quietHoursStart: isValidTimeString(raw.quietHoursStart)
      ? raw.quietHoursStart
      : DEFAULT_CHECKIN_PREFERENCES.quietHoursStart,
    quietHoursEnd: isValidTimeString(raw.quietHoursEnd)
      ? raw.quietHoursEnd
      : DEFAULT_CHECKIN_PREFERENCES.quietHoursEnd,
  };
}

/**
 * Checks whether a given "HH:mm" time falls inside configured quiet hours.
 */
export function isTimeInQuietHours(
  timeStr: string,
  quietStart: string,
  quietEnd: string,
  quietEnabled: boolean
): boolean {
  if (!quietEnabled) return false;
  if (!isValidTimeString(timeStr) || !isValidTimeString(quietStart) || !isValidTimeString(quietEnd)) {
    return false;
  }
  if (quietStart === quietEnd) return false;

  const [tH, tM] = timeStr.split(':').map(Number);
  const [sH, sM] = quietStart.split(':').map(Number);
  const [eH, eM] = quietEnd.split(':').map(Number);

  const tMinutes = tH * 60 + tM;
  const sMinutes = sH * 60 + sM;
  const eMinutes = eH * 60 + eM;

  if (sMinutes < eMinutes) {
    return tMinutes >= sMinutes && tMinutes < eMinutes;
  } else {
    return tMinutes >= sMinutes || tMinutes < eMinutes;
  }
}

/**
 * Loads all 6 notification preferences from AsyncStorage.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    if (raw) {
      return validateNotificationPreferences(JSON.parse(raw));
    }
    // Check fallback to legacy checkin key
    const legacy = await AsyncStorage.getItem(CHECKIN_PREFERENCES_KEY);
    if (legacy) {
      return validateNotificationPreferences(JSON.parse(legacy));
    }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

/**
 * Persists full notification preferences to AsyncStorage.
 */
export async function saveNotificationPreferences(
  prefs: NotificationPreferences
): Promise<NotificationPreferences> {
  const validated = validateNotificationPreferences(prefs);
  await AsyncStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(validated));
  // Keep legacy key in sync for backward compatibility
  const checkinForm: CheckinPreferences = {
    morningEnabled: validated.morningCheckin,
    morningTime: validated.morningTime,
    eveningEnabled: validated.eveningCheckin,
    eveningTime: validated.eveningTime,
    quietHoursEnabled: validated.quietHoursEnabled,
    quietHoursStart: validated.quietHoursStart,
    quietHoursEnd: validated.quietHoursEnd,
  };
  await AsyncStorage.setItem(CHECKIN_PREFERENCES_KEY, JSON.stringify(checkinForm));
  return validated;
}

/**
 * Modifies an individual notification preference independently.
 * Guarantees that updating one category NEVER alters or disables any other category.
 */
export async function updateNotificationCategory<K extends keyof NotificationPreferences>(
  key: K,
  value: NotificationPreferences[K]
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences();
  const updated = {
    ...current,
    [key]: value,
  };
  return await saveNotificationPreferences(updated);
}

/**
 * Legacy loader for checkinScheduler compatibility.
 */
export async function getCheckinPreferences(): Promise<CheckinPreferences> {
  const full = await getNotificationPreferences();
  return {
    morningEnabled: full.morningCheckin,
    morningTime: full.morningTime,
    eveningEnabled: full.eveningCheckin,
    eveningTime: full.eveningTime,
    quietHoursEnabled: full.quietHoursEnabled,
    quietHoursStart: full.quietHoursStart,
    quietHoursEnd: full.quietHoursEnd,
  };
}

/**
 * Legacy saver for checkinScheduler compatibility.
 */
export async function saveCheckinPreferences(
  prefs: CheckinPreferences
): Promise<CheckinPreferences> {
  const current = await getNotificationPreferences();
  const updated: NotificationPreferences = {
    ...current,
    morningCheckin: prefs.morningEnabled,
    morningTime: prefs.morningTime,
    eveningCheckin: prefs.eveningEnabled,
    eveningTime: prefs.eveningTime,
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietHoursStart: prefs.quietHoursStart,
    quietHoursEnd: prefs.quietHoursEnd,
  };
  await saveNotificationPreferences(updated);
  return validateCheckinPreferences(prefs);
}
