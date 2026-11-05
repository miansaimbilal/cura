import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { MoodEntry, CreateMoodInput, UpdateMoodInput } from '../types/mood';
import { getDatabase } from '../db/client';
import {
  createMoodEntry,
  getAllMoodEntries,
  updateMoodEntry,
  deleteMoodEntry,
  getMoodEntriesByDateRange,
} from '../db/moodRepository';
import { getLocalDayRange } from '../utils/date';

interface MoodContextValue {
  moodEntries: MoodEntry[];
  todayMoods: MoodEntry[];
  latestMood: MoodEntry | null;
  isLoading: boolean;
  createMood: (input: CreateMoodInput) => Promise<MoodEntry>;
  updateMood: (id: string, input: UpdateMoodInput) => Promise<MoodEntry>;
  deleteMood: (id: string) => Promise<boolean>;
  refreshMoods: () => Promise<void>;
  getEntriesForDateRange: (startISO: string, endISO: string) => Promise<MoodEntry[]>;
}

const MoodContext = createContext<MoodContextValue | null>(null);

export function MoodProvider({ children }: { children: ReactNode }) {
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [todayMoods, setTodayMoods] = useState<MoodEntry[]>([]);
  const [latestMood, setLatestMood] = useState<MoodEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshMoods = useCallback(async () => {
    try {
      const db = await getDatabase();
      const all = await getAllMoodEntries(db);
      setMoodEntries(all);

      // Latest recorded entry
      setLatestMood(all.length > 0 ? all[0] : null);

      // Today's entries (using local calendar day range)
      const dayRange = getLocalDayRange();
      const today = await getMoodEntriesByDateRange(db, dayRange.startISO, dayRange.endISO);
      setTodayMoods(today);
    } catch (err) {
      console.error('Failed to load mood entries:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    getDatabase()
      .then(async (db) => {
        const all = await getAllMoodEntries(db);
        const dayRange = getLocalDayRange();
        const today = await getMoodEntriesByDateRange(db, dayRange.startISO, dayRange.endISO);

        if (!isCancelled) {
          setMoodEntries(all);
          setLatestMood(all.length > 0 ? all[0] : null);
          setTodayMoods(today);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize mood database:', err);
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleCreateMood = useCallback(
    async (input: CreateMoodInput): Promise<MoodEntry> => {
      const db = await getDatabase();
      const created = await createMoodEntry(db, input);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Haptics might be unavailable in some environments
      }
      await refreshMoods();
      return created;
    },
    [refreshMoods]
  );

  const handleUpdateMood = useCallback(
    async (id: string, input: UpdateMoodInput): Promise<MoodEntry> => {
      const db = await getDatabase();
      const updated = await updateMoodEntry(db, id, input);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignore haptic failure
      }
      await refreshMoods();
      return updated;
    },
    [refreshMoods]
  );

  const handleDeleteMood = useCallback(
    async (id: string): Promise<boolean> => {
      const db = await getDatabase();
      const result = await deleteMoodEntry(db, id);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {
        // Ignore haptic failure
      }
      await refreshMoods();
      return result;
    },
    [refreshMoods]
  );

  const getEntriesForDateRange = useCallback(
    async (startISO: string, endISO: string): Promise<MoodEntry[]> => {
      const db = await getDatabase();
      return await getMoodEntriesByDateRange(db, startISO, endISO);
    },
    []
  );

  return (
    <MoodContext.Provider
      value={{
        moodEntries,
        todayMoods,
        latestMood,
        isLoading,
        createMood: handleCreateMood,
        updateMood: handleUpdateMood,
        deleteMood: handleDeleteMood,
        refreshMoods,
        getEntriesForDateRange,
      }}
    >
      {children}
    </MoodContext.Provider>
  );
}

export function useMood(): MoodContextValue {
  const context = useContext(MoodContext);
  if (!context) {
    throw new Error('useMood must be used within a MoodProvider');
  }
  return context;
}
