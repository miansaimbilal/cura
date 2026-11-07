import { useState, useEffect, useCallback } from 'react';
import { DailySummaryData } from '../types/analytics';
import { calculateDailySummary } from '../services/dailySummaryService';
import { getDatabase } from '../db/client';
import { useTasks } from './useTasks';
import { useMood } from './useMood';
import { IDatabase } from '../db/types';

export interface UseDailySummaryResult {
  summary: DailySummaryData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Custom hook providing on-demand, reactive daily summary metrics.
 * - Single source of truth is SQLite.
 * - Calculates throughput, cohort completion, and mood distribution on-demand.
 * - Reacts and refreshes underlying database queries when TaskProvider or MoodProvider data changes.
 * - Provides clean loading, empty, and error states.
 */
export function useDailySummary(
  localDate: string,
  customDb?: IDatabase
): UseDailySummaryResult {
  const { tasks } = useTasks();
  const { moodEntries } = useMood();

  const [summary, setSummary] = useState<DailySummaryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const db = customDb ?? (await getDatabase());
      const data = await calculateDailySummary(db, localDate);
      setSummary(data);
      setError(null);
    } catch (err: any) {
      console.warn('[useDailySummary] Failed to calculate daily summary', err);
      setError(err?.message || 'Failed to calculate daily summary');
    } finally {
      setIsLoading(false);
    }
  }, [localDate, customDb]);

  useEffect(() => {
    let isMounted = true;

    (customDb ? Promise.resolve(customDb) : getDatabase())
      .then((db) => calculateDailySummary(db, localDate))
      .then((data) => {
        if (!isMounted) return;
        setSummary(data);
        setError(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[useDailySummary] Failed to calculate daily summary', err);
        setError(err?.message || 'Failed to calculate daily summary');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [localDate, customDb, tasks, moodEntries]);

  return {
    summary,
    isLoading,
    error,
    refresh,
  };
}
