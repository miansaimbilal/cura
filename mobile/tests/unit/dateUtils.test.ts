import { describe, it, expect } from 'vitest';
import {
  getLocalDateString,
  getLocalTimeString,
  getTomorrowDateString,
  isValidDateString,
  isValidTimeString,
  formatDisplayDate,
  formatDisplayTime,
  isTaskOverdue,
} from '../../src/utils/date';

describe('Date & Time Utilities (Unit Tests)', () => {
  it('formats local date string as YYYY-MM-DD correctly without UTC shift', () => {
    const fixedDate = new Date(2026, 10, 5, 1, 30, 0); // Nov 5, 2026 01:30 AM
    expect(getLocalDateString(fixedDate)).toBe('2026-11-05');
  });

  it('formats local time string as HH:MM in 24h format', () => {
    const morning = new Date(2026, 10, 5, 9, 5, 0);
    expect(getLocalTimeString(morning)).toBe('09:05');

    const afternoon = new Date(2026, 10, 5, 14, 30, 0);
    expect(getLocalTimeString(afternoon)).toBe('14:30');
  });

  it('calculates tomorrow date string correctly across month boundaries', () => {
    const endOfMonth = new Date(2026, 9, 31, 23, 0, 0); // Oct 31, 2026
    expect(getTomorrowDateString(endOfMonth)).toBe('2026-11-01');
  });

  it('validates date strings strictly', () => {
    expect(isValidDateString('2026-11-05')).toBe(true);
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-13-01')).toBe(false); // Invalid month
    expect(isValidDateString('2026-02-30')).toBe(false); // Invalid day in Feb
    expect(isValidDateString('invalid-date')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(null)).toBe(false);
  });

  it('validates time strings strictly', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('09:30')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('24:00')).toBe(false); // 24 is out of bounds
    expect(isValidTimeString('12:60')).toBe(false); // 60 is out of bounds
    expect(isValidTimeString('9:30')).toBe(false); // Needs 2 digits
    expect(isValidTimeString('')).toBe(false);
  });

  it('formats display dates friendly (Today, Tomorrow, Yesterday)', () => {
    const ref = new Date(2026, 10, 5, 12, 0, 0); // Nov 5, 2026
    expect(formatDisplayDate('2026-11-05', ref)).toBe('Today');
    expect(formatDisplayDate('2026-11-06', ref)).toBe('Tomorrow');
    expect(formatDisplayDate('2026-11-04', ref)).toBe('Yesterday');
    expect(formatDisplayDate('2026-11-12', ref)).toContain('Nov 12');
    expect(formatDisplayDate(null, ref)).toBe('No date');
  });

  it('formats display time in 12-hour AM/PM format', () => {
    expect(formatDisplayTime('00:00')).toBe('12:00 AM');
    expect(formatDisplayTime('09:05')).toBe('9:05 AM');
    expect(formatDisplayTime('12:00')).toBe('12:00 PM');
    expect(formatDisplayTime('14:30')).toBe('2:30 PM');
    expect(formatDisplayTime('21:45')).toBe('9:45 PM');
    expect(formatDisplayTime(null)).toBe('');
  });

  it('identifies overdue tasks accurately', () => {
    const ref = new Date(2026, 10, 5, 15, 0, 0); // Nov 5, 2026, 3:00 PM

    // Task due yesterday
    expect(isTaskOverdue('2026-11-04', null, ref)).toBe(true);
    expect(isTaskOverdue('2026-11-04', '10:00', ref)).toBe(true);

    // Task due today, but time was 10:00 AM (past)
    expect(isTaskOverdue('2026-11-05', '10:00', ref)).toBe(true);

    // Task due today, but time is 18:00 (future)
    expect(isTaskOverdue('2026-11-05', '18:00', ref)).toBe(false);

    // Task due today untimed (not overdue until day passes)
    expect(isTaskOverdue('2026-11-05', null, ref)).toBe(false);

    // Task due tomorrow
    expect(isTaskOverdue('2026-11-06', '09:00', ref)).toBe(false);
  });
});
