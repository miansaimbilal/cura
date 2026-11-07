import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckinPreferences } from '../types/checkin';

export const CHECKIN_PREFERENCES_KEY = '@cura_checkin_preferences';

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
 * Validates a preferences object, recovering with safe defaults for any invalid or missing fields.
 */
export function validateCheckinPreferences(raw: any): CheckinPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHECKIN_PREFERENCES };
  }

  return {
    morningEnabled:
      typeof raw.morningEnabled === 'boolean'
        ? raw.morningEnabled
        : DEFAULT_CHECKIN_PREFERENCES.morningEnabled,
    morningTime: isValidTimeString(raw.morningTime)
      ? raw.morningTime
      : DEFAULT_CHECKIN_PREFERENCES.morningTime,
    eveningEnabled:
      typeof raw.eveningEnabled === 'boolean'
        ? raw.eveningEnabled
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
 * - If quietHoursEnabled is false, returns false.
 * - If quietHoursStart equals quietHoursEnd, quiet hours are treated as disabled (returns false).
 * - Supports both standard ranges (e.g. 13:00 to 15:00) and overnight ranges (e.g. 22:00 to 07:00).
 * - Boundary: inclusive on start, exclusive on end (e.g. 22:00 to 07:00 suppresses at 22:00, allows at 07:00).
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
    // Standard intra-day range (e.g., 13:00 to 15:00)
    return tMinutes >= sMinutes && tMinutes < eMinutes;
  } else {
    // Overnight range (e.g., 22:00 to 07:00)
    return tMinutes >= sMinutes || tMinutes < eMinutes;
  }
}

/**
 * Loads checkin preferences from AsyncStorage, safely defaulted.
 */
export async function getCheckinPreferences(): Promise<CheckinPreferences> {
  try {
    const raw = await AsyncStorage.getItem(CHECKIN_PREFERENCES_KEY);
    if (!raw) {
      return { ...DEFAULT_CHECKIN_PREFERENCES };
    }
    const parsed = JSON.parse(raw);
    return validateCheckinPreferences(parsed);
  } catch (error) {
    console.warn('Failed to read checkin preferences, returning defaults', error);
    return { ...DEFAULT_CHECKIN_PREFERENCES };
  }
}

/**
 * Validates and persists checkin preferences to AsyncStorage.
 */
export async function saveCheckinPreferences(
  prefs: CheckinPreferences
): Promise<CheckinPreferences> {
  const validated = validateCheckinPreferences(prefs);
  await AsyncStorage.setItem(CHECKIN_PREFERENCES_KEY, JSON.stringify(validated));
  return validated;
}
