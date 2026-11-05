import { IDatabase } from '../db/types';
import {
  DateRange,
  TaskActivityDay,
  TaskCompletionMetric,
} from '../types/analytics';
import { toLocalDateString, getLocalDateString } from './date';
import { TaskRow } from '../types/task';

interface HistoryTransitionRow {
  rowid: number;
  task_id: string;
  action: string;
  timestamp: string;
}

/**
 * Calculates Task Completion Rate for a local calendar date range.
 *
 * COHORT RULES (Safeguard 3):
 * - Uses the latest current due_date to determine a scheduled task's cohort.
 * - If due_date is null, assigns to the cohort of the task's creation local date.
 * - Excludes cancelled (status = 'cancelled') and soft-deleted (is_deleted = 1) tasks.
 * - Completion is evaluated from the task's current status = 'completed'.
 * - Returns null percentage when total is 0 to avoid misleading 0% or 100% displays.
 */
export async function getTaskCompletionForPeriod(
  db: IDatabase,
  dateRange: DateRange,
  userId: string = 'guest'
): Promise<TaskCompletionMetric> {
  const { startDate, endDate } = dateRange;

  // Retrieve active tasks that either have due_date or are untimed
  const rows = await db.getAllAsync<TaskRow>(
    `SELECT * FROM tasks
     WHERE user_id = ? AND is_deleted = 0 AND status != 'cancelled'
       AND (
         (due_date IS NOT NULL AND due_date >= ? AND due_date <= ?)
         OR (due_date IS NULL)
       );`,
    userId,
    startDate,
    endDate
  );

  let total = 0;
  let completed = 0;

  for (const row of rows) {
    let belongsToPeriod = false;

    if (row.due_date) {
      belongsToPeriod = row.due_date >= startDate && row.due_date <= endDate;
    } else {
      const createdLocalDate = toLocalDateString(row.created_at);
      belongsToPeriod = createdLocalDate >= startDate && createdLocalDate <= endDate;
    }

    if (belongsToPeriod) {
      total += 1;
      if (row.status === 'completed') {
        completed += 1;
      }
    }
  }

  const percentage = total > 0 ? Math.round((completed / total) * 100) : null;

  return {
    total,
    completed,
    percentage,
  };
}

/**
 * Calculates historical Daily Task Activity for each day in a local calendar date range.
 *
 * SAFEGUARDS 1 & 2 & TECHNICAL CORRECTIONS:
 * - Uses task_history as the single source of truth for completion throughput.
 * - Filters strictly for action IN ('completed', 'uncompleted'). Other actions are ignored.
 * - Evaluates each task on each local calendar day.
 * - Orders transitions deterministically by timestamp DESC, rowid DESC (using SQLite rowid).
 * - Identifies the latest completion-state transition on that local calendar day.
 * - Counts the task exactly once if and only if its latest transition was 'completed'.
 * - Preserves historical records: subsequent uncompletion on another day does not alter past days.
 */
export async function getTaskActivityForPeriod(
  db: IDatabase,
  dateRange: DateRange
): Promise<TaskActivityDay[]> {
  const { startDate, endDate, startISO, endISO } = dateRange;

  // Query completion-state transitions within the inclusive start / exclusive end ISO range
  // Selecting SQLite's built-in monotonic rowid for deterministic insertion tie-breaking
  const rows = await db.getAllAsync<HistoryTransitionRow>(
    `SELECT rowid, task_id, action, timestamp
     FROM task_history
     WHERE action IN ('completed', 'uncompleted')
       AND timestamp >= ? AND timestamp < ?
     ORDER BY timestamp DESC, rowid DESC;`,
    startISO,
    endISO
  );

  // Group transitions by local calendar date and task_id
  // Map: localDate -> Map: task_id -> latest action
  const dayTaskActionMap = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const localDate = toLocalDateString(row.timestamp);
    if (localDate < startDate || localDate > endDate) {
      continue;
    }

    if (!dayTaskActionMap.has(localDate)) {
      dayTaskActionMap.set(localDate, new Map<string, string>());
    }

    const taskMap = dayTaskActionMap.get(localDate)!;
    // Because rows are ordered timestamp DESC, rowid DESC, the first transition
    // encountered for a task on this day is its latest completion-state transition!
    if (!taskMap.has(row.task_id)) {
      taskMap.set(row.task_id, row.action);
    }
  }

  // Build the continuous list of calendar days in this period
  const days: TaskActivityDay[] = [];
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  const curDate = new Date(startYear, startMonth - 1, startDay, 12, 0, 0); // Noon to prevent DST issues
  const stopDate = new Date(endYear, endMonth - 1, endDay, 12, 0, 0);

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  while (curDate <= stopDate) {
    const dateStr = getLocalDateString(curDate);
    const dayOfWeek = weekdayNames[curDate.getDay()];
    const dayLabel = `${dayOfWeek} ${curDate.getDate()}`;

    const taskMap = dayTaskActionMap.get(dateStr);
    let completedCount = 0;

    if (taskMap) {
      for (const action of taskMap.values()) {
        if (action === 'completed') {
          completedCount += 1;
        }
      }
    }

    days.push({
      date: dateStr,
      dayLabel,
      completedCount,
    });

    curDate.setDate(curDate.getDate() + 1);
  }

  return days;
}
