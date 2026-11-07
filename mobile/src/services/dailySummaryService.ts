import { IDatabase } from '../db/types';
import { DailySummaryData, DateRange } from '../types/analytics';
import { getTaskCompletionForPeriod, getTaskActivityForPeriod } from '../utils/analytics';
import { getMoodDistribution } from '../db/moodRepository';
import { isValidDateString, getLocalDateString, formatDisplayDate } from '../utils/date';

/**
 * Builds the exact single local day DateRange for a given YYYY-MM-DD string,
 * avoiding any UTC shifts that could alter the user's intended calendar date.
 */
export function buildSingleDayRange(localDate: string): DateRange {
  if (!isValidDateString(localDate)) {
    throw new Error(`Invalid local calendar date string: "${localDate}". Expected YYYY-MM-DD.`);
  }

  const [year, month, day] = localDate.split('-').map(Number);
  const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const nextDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  return {
    startDate: localDate,
    endDate: localDate,
    startISO: startDate.toISOString(),
    endISO: nextDate.toISOString(),
    label: formatDisplayDate(localDate, startDate),
  };
}

/**
 * Pure on-demand daily summary calculation using SQLite as the single source of truth.
 * Strictly calculates metrics on-demand without any SQLite daily_summaries caching.
 *
 * Metrics calculated independently:
 * 1. Throughput: Task transitions on this local date from task_history (timestamp DESC, rowid DESC)
 * 2. Cohort: Tasks scheduled for this date (or untimed tasks created on this date), excluding cancelled/deleted
 * 3. Mood: Deterministic categorical distribution over 9 mood categories (empty = total: 0, items: [])
 */
export async function calculateDailySummary(
  db: IDatabase,
  localDate: string,
  userId = 'guest'
): Promise<DailySummaryData> {
  const safeDate = isValidDateString(localDate) ? localDate : getLocalDateString();
  const dayRange = buildSingleDayRange(safeDate);

  // 1. Task Cohort Completion
  const cohortMetric = await getTaskCompletionForPeriod(db, dayRange, userId);

  // 2. Daily Task Throughput (task_history transitions)
  const activityDays = await getTaskActivityForPeriod(db, dayRange);
  const completedThroughput = activityDays.length > 0 ? activityDays[0].completedCount : 0;

  // 3. Categorical Mood Distribution
  const moodDist = await getMoodDistribution(db, dayRange.startISO, dayRange.endISO, userId);

  return {
    localDate: safeDate,
    throughput: {
      completedCount: completedThroughput,
    },
    cohort: {
      total: cohortMetric.total,
      completed: cohortMetric.completed,
      percentage: cohortMetric.percentage,
    },
    mood: moodDist,
  };
}
