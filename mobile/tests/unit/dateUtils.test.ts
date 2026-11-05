import { describe, it, expect } from 'vitest';
import {
  getLocalDateString,
  getLocalTimeString,
  toLocalDateString,
  toLocalTimeString,
  getTomorrowDateString,
  isValidDateString,
  isValidTimeString,
  formatDisplayDate,
  formatDisplayTime,
  isTaskOverdue,
  getLocalDayRange,
  getCalendarWeekRange,
  getCalendarMonthRange,
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

  it('converts ISO timestamp to local date string without UTC day shift', () => {
    // A timestamp at 11:30 PM local on Dec 31
    const endOfYear = new Date(2026, 11, 31, 23, 30, 0);
    const isoString = endOfYear.toISOString();
    expect(toLocalDateString(isoString)).toBe('2026-12-31');
    expect(toLocalTimeString(isoString)).toBe('23:30');
  });

  it('handles year transitions correctly for calendar ranges', () => {
    const newYearEve = new Date(2026, 11, 31, 10, 0, 0);
    const dayRange = getLocalDayRange(newYearEve);
    expect(dayRange.startDate).toBe('2026-12-31');
    expect(dayRange.endDate).toBe('2026-12-31');
    expect(new Date(dayRange.startISO).getFullYear()).toBe(2026);
    expect(new Date(dayRange.endISO).getFullYear()).toBe(2027);
  });

  it('computes Monday-to-Sunday calendar week range correctly', () => {
    // Thursday Nov 5, 2026
    const thursday = new Date(2026, 10, 5, 14, 0, 0);
    const weekRange = getCalendarWeekRange(thursday);
    expect(weekRange.startDate).toBe('2026-11-02'); // Monday Nov 2
    expect(weekRange.endDate).toBe('2026-11-08'); // Sunday Nov 8
  });

  it('computes 1st-to-last calendar month range correctly', () => {
    // Nov 5, 2026
    const midMonth = new Date(2026, 10, 5, 12, 0, 0);
    const monthRange = getCalendarMonthRange(midMonth);
    expect(monthRange.startDate).toBe('2026-11-01');
    expect(monthRange.endDate).toBe('2026-11-30');
    expect(monthRange.label).toContain('November 2026');
  });
});
