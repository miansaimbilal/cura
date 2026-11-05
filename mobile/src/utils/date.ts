/**
 * Date and time utilities for Cura mobile client.
 *
 * DATE STRATEGY:
 * - All calendar dates are represented and stored as 'YYYY-MM-DD' local date strings.
 *   This avoids UTC offset conversion bugs where a user's local date changes crossing midnight.
 * - All times are represented and stored as 'HH:MM' 24-hour local time strings.
 * - Timestamps (createdAt, updatedAt, completedAt, loggedAt, etc.) are stored as ISO 8601 strings.
 * - Note on Timezones: Historical timestamps are interpreted using the device's current local timezone.
 *   Date boundaries are calculated locally and converted into inclusive start / exclusive end ISO timestamp ranges.
 */

import { DateRange } from '../types/analytics';

/**
 * Returns the local date string in YYYY-MM-DD format.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts any ISO 8601 timestamp string into a local YYYY-MM-DD date string.
 * Uses the device's local calendar and timezone rather than a raw UTC substring.
 */
export function toLocalDateString(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return '';
  }
  return getLocalDateString(d);
}

/**
 * Converts any ISO 8601 timestamp string into local HH:MM 24-hour time format.
 */
export function toLocalTimeString(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return '';
  }
  return getLocalTimeString(d);
}

/**
 * Returns the local time string in HH:MM format.
 */
export function getLocalTimeString(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Returns the local date string for tomorrow.
 */
export function getTomorrowDateString(baseDate: Date = new Date()): string {
  const tomorrow = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1);
  return getLocalDateString(tomorrow);
}

/**
 * Validates whether a string matches YYYY-MM-DD.
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Validates whether a string matches HH:MM in 24-hour format.
 */
export function isValidTimeString(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  const match = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Formats a YYYY-MM-DD date string into a friendly relative or formatted date.
 * e.g., 'Today', 'Tomorrow', 'Yesterday', or 'Wed, Nov 5'.
 */
export function formatDisplayDate(dateStr: string | null | undefined, referenceDate: Date = new Date()): string {
  if (!dateStr || !isValidDateString(dateStr)) return 'No date';

  const todayStr = getLocalDateString(referenceDate);
  if (dateStr === todayStr) return 'Today';

  const tomorrowStr = getTomorrowDateString(referenceDate);
  if (dateStr === tomorrowStr) return 'Tomorrow';

  const yesterday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - 1);
  if (dateStr === getLocalDateString(yesterday)) return 'Yesterday';

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };

  if (date.getFullYear() !== referenceDate.getFullYear()) {
    options.year = 'numeric';
  }

  return date.toLocaleDateString(undefined, options);
}

/**
 * Formats an HH:MM 24-hour time string into a 12-hour AM/PM string.
 * e.g., '14:30' -> '2:30 PM', '09:05' -> '9:05 AM'.
 */
export function formatDisplayTime(timeStr: string | null | undefined): string {
  if (!timeStr || !isValidTimeString(timeStr)) return '';

  const [hoursStr, minutesStr] = timeStr.split(':');
  let hours = parseInt(hoursStr, 10);
  const minutes = minutesStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour should be 12

  return `${hours}:${minutes} ${ampm}`;
}

/**
 * Determines whether a task with a given due date and time is overdue.
 */
export function isTaskOverdue(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!dueDate || !isValidDateString(dueDate)) return false;

  const todayStr = getLocalDateString(referenceDate);
  if (dueDate < todayStr) return true;

  if (dueDate === todayStr && dueTime && isValidTimeString(dueTime)) {
    const currentTimeStr = getLocalTimeString(referenceDate);
    return dueTime < currentTimeStr;
  }

  return false;
}

/**
 * Computes the inclusive start and exclusive end timestamp range for a single local calendar day.
 * Handles daylight saving transitions without assuming a 24-hour day.
 */
export function getLocalDayRange(date: Date = new Date()): DateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const startDate = new Date(year, month, day, 0, 0, 0, 0);
  const nextDate = new Date(year, month, day + 1, 0, 0, 0, 0);

  const dateStr = getLocalDateString(startDate);
  const label = formatDisplayDate(dateStr, date);

  return {
    startDate: dateStr,
    endDate: dateStr,
    startISO: startDate.toISOString(),
    endISO: nextDate.toISOString(),
    label,
  };
}

/**
 * Computes the calendar week range (Monday 00:00:00 to next Monday 00:00:00 exclusive).
 * Aligns with ISO 8601 where Monday is day 1.
 */
export function getCalendarWeekRange(referenceDate: Date = new Date()): DateRange {
  const currentDay = referenceDate.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
  // Distance back to Monday: If Sunday (0), distance is 6. Otherwise day - 1.
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  const mondayDate = new Date(year, month, day - distanceToMonday, 0, 0, 0, 0);
  const sundayDate = new Date(year, month, day - distanceToMonday + 6, 23, 59, 59, 999);
  const nextMondayDate = new Date(year, month, day - distanceToMonday + 7, 0, 0, 0, 0);

  const startStr = getLocalDateString(mondayDate);
  const endStr = getLocalDateString(sundayDate);

  const startFmt = mondayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endFmt = sundayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const label = `${startFmt} – ${endFmt}`;

  return {
    startDate: startStr,
    endDate: endStr,
    startISO: mondayDate.toISOString(),
    endISO: nextMondayDate.toISOString(),
    label,
  };
}

/**
 * Computes the calendar month range (1st of month 00:00:00 to 1st of next month 00:00:00 exclusive).
 */
export function getCalendarMonthRange(referenceDate: Date = new Date()): DateRange {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const firstDate = new Date(year, month, 1, 0, 0, 0, 0);
  const nextMonthFirstDate = new Date(year, month + 1, 1, 0, 0, 0, 0);
  const lastDayDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const startStr = getLocalDateString(firstDate);
  const endStr = getLocalDateString(lastDayDate);

  const label = firstDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return {
    startDate: startStr,
    endDate: endStr,
    startISO: firstDate.toISOString(),
    endISO: nextMonthFirstDate.toISOString(),
    label,
  };
}
