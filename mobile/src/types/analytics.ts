import { MoodDistribution } from './mood';

export type AnalyticsPeriod = 'day' | 'week' | 'month';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startISO: string; // ISO 8601 inclusive start
  endISO: string; // ISO 8601 exclusive end
  label: string; // User-facing period label, e.g. "Mon, Nov 2 - Sun, Nov 8"
}

export interface TaskActivityDay {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Mon", "11/02"
  completedCount: number;
}

export interface TaskCompletionMetric {
  total: number;
  completed: number;
  percentage: number | null; // null if total is 0
}

export interface AnalyticsSummary {
  period: AnalyticsPeriod;
  dateRange: DateRange;
  moodDistribution: MoodDistribution;
  taskCompletion: TaskCompletionMetric;
  taskActivity: TaskActivityDay[];
  totalMoodLogs: number;
  totalTasksFinished: number;
}

export interface DailySummaryData {
  localDate: string;
  throughput: {
    completedCount: number;
  };
  cohort: {
    total: number;
    completed: number;
    percentage: number | null;
  };
  mood: MoodDistribution;
}
