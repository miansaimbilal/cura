import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilter,
  TaskSummary,
  TaskHistoryEntry,
} from '../types/task';
import { getDatabase } from '../db/client';
import {
  createTask as repoCreateTask,
  updateTask as repoUpdateTask,
  toggleTaskComplete as repoToggleComplete,
  postponeTask as repoPostponeTask,
  cancelTask as repoCancelTask,
  softDeleteTask as repoDeleteTask,
  getFilteredTasks,
  getTodaySummary,
  getTaskHistory as repoGetTaskHistory,
} from '../db/taskRepository';
import { getLocalDateString } from '../utils/date';
import {
  scheduleTaskReminder,
  cancelTaskReminder,
} from '../services/taskNotificationScheduler';

export interface TaskContextType {
  tasks: Task[];
  filteredTasks: Task[];
  currentFilter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  todaySummary: TaskSummary;
  isLoading: boolean;
  error: string | null;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<Task>;
  toggleComplete: (id: string) => Promise<Task>;
  postponeTask: (id: string, newDate: string, newTime?: string | null) => Promise<Task>;
  cancelTask: (id: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<boolean>;
  getTaskHistory: (taskId: string) => Promise<TaskHistoryEntry[]>;
  refreshTasks: () => Promise<void>;
}

const TaskContext = createContext<TaskContextType | null>(null);

export interface TaskProviderProps {
  children: ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [currentFilter, setCurrentFilter] = useState<TaskFilter>('today');
  const [todaySummary, setTodaySummary] = useState<TaskSummary>({
    total: 0,
    completed: 0,
    remaining: 0,
    overdue: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (filter: TaskFilter = currentFilter) => {
    try {
      const db = await getDatabase();
      const today = getLocalDateString();

      const [filtered, allActive, summary] = await Promise.all([
        getFilteredTasks(db, filter, { currentDate: today }),
        getFilteredTasks(db, 'all', { currentDate: today }),
        getTodaySummary(db, today),
      ]);

      setFilteredTasks(filtered);
      setTasks(allActive);
      setTodaySummary(summary);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load tasks from SQLite:', err);
      setError(err?.message || 'Failed to initialize task database');
    } finally {
      setIsLoading(false);
    }
  }, [currentFilter]);

  useEffect(() => {
    let isCancelled = false;
    getDatabase()
      .then(async (db) => {
        const today = getLocalDateString();
        const [filtered, allActive, summary] = await Promise.all([
          getFilteredTasks(db, currentFilter, { currentDate: today }),
          getFilteredTasks(db, 'all', { currentDate: today }),
          getTodaySummary(db, today),
        ]);
        if (!isCancelled) {
          setFilteredTasks(filtered);
          setTasks(allActive);
          setTodaySummary(summary);
          setError(null);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (!isCancelled) {
          console.error('Failed to load tasks from SQLite:', err);
          setError(err?.message || 'Failed to initialize task database');
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentFilter]);

  const handleSetFilter = useCallback((filter: TaskFilter) => {
    setCurrentFilter(filter);
    loadData(filter);
  }, [loadData]);

  const handleCreateTask = useCallback(async (input: CreateTaskInput): Promise<Task> => {
    const db = await getDatabase();
    const newTask = await repoCreateTask(db, input);
    await loadData(currentFilter);
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics not available on web/unsupported device
    }
    // Schedule reminder if timed
    scheduleTaskReminder(newTask).catch((err) =>
      console.warn('Failed to schedule reminder for task:', err)
    );
    return newTask;
  }, [loadData, currentFilter]);

  const handleUpdateTask = useCallback(async (id: string, input: UpdateTaskInput): Promise<Task> => {
    const db = await getDatabase();
    const updated = await repoUpdateTask(db, id, input);
    await loadData(currentFilter);
    scheduleTaskReminder(updated).catch((err) =>
      console.warn('Failed to update reminder for task:', err)
    );
    return updated;
  }, [loadData, currentFilter]);

  const handleToggleComplete = useCallback(async (id: string): Promise<Task> => {
    const db = await getDatabase();
    const updated = await repoToggleComplete(db, id);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Haptics optional
    }
    await loadData(currentFilter);
    if (updated.status === 'completed') {
      cancelTaskReminder(updated.id).catch((err) =>
        console.warn('Failed to cancel reminder on task completion:', err)
      );
    } else {
      scheduleTaskReminder(updated).catch((err) =>
        console.warn('Failed to reschedule reminder on task reopen:', err)
      );
    }
    return updated;
  }, [loadData, currentFilter]);

  const handlePostponeTask = useCallback(async (
    id: string,
    newDate: string,
    newTime?: string | null
  ): Promise<Task> => {
    const db = await getDatabase();
    const updated = await repoPostponeTask(db, id, newDate, newTime);
    await loadData(currentFilter);
    scheduleTaskReminder(updated).catch((err) =>
      console.warn('Failed to update reminder on postpone:', err)
    );
    return updated;
  }, [loadData, currentFilter]);

  const handleCancelTask = useCallback(async (id: string): Promise<Task> => {
    const db = await getDatabase();
    const updated = await repoCancelTask(db, id);
    await loadData(currentFilter);
    cancelTaskReminder(id).catch((err) =>
      console.warn('Failed to cancel reminder on task cancellation:', err)
    );
    return updated;
  }, [loadData, currentFilter]);

  const handleDeleteTask = useCallback(async (id: string): Promise<boolean> => {
    const db = await getDatabase();
    const success = await repoDeleteTask(db, id);
    if (success) {
      await loadData(currentFilter);
      cancelTaskReminder(id).catch((err) =>
        console.warn('Failed to cancel reminder on task delete:', err)
      );
    }
    return success;
  }, [loadData, currentFilter]);

  const handleGetTaskHistory = useCallback(async (taskId: string): Promise<TaskHistoryEntry[]> => {
    const db = await getDatabase();
    return repoGetTaskHistory(db, taskId);
  }, []);

  const value: TaskContextType = {
    tasks,
    filteredTasks,
    currentFilter,
    setFilter: handleSetFilter,
    todaySummary,
    isLoading,
    error,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    toggleComplete: handleToggleComplete,
    postponeTask: handlePostponeTask,
    cancelTask: handleCancelTask,
    deleteTask: handleDeleteTask,
    getTaskHistory: handleGetTaskHistory,
    refreshTasks: () => loadData(currentFilter),
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};

export function useTasks(): TaskContextType {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
}
