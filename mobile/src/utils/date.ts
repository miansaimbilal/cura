/**
 * Date and time utilities for Cura mobile client.
 *
 * DATE STRATEGY:
 * - All calendar dates are represented and stored as 'YYYY-MM-DD' local date strings.
 *   This avoids UTC offset conversion bugs where a user's local date changes crossing midnight.
 * - All times are represented and stored as 'HH:MM' 24-hour local time strings.
 * - Timestamps (createdAt, updatedAt, completedAt, etc.) are stored as ISO 8601 strings.
 */

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
  const tomorrow = new Date(baseDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
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

  const yesterday = new Date(referenceDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === getLocalDateString(yesterday)) return 'Yesterday';

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };

  // If the year is different from current year, include the year
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
