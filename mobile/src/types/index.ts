export * from './task';
export * from './mood';
export * from './analytics';
export * from './chat';

export type Priority = 'low' | 'medium' | 'high';

export type TaskStatus = 'pending' | 'completed' | 'postponed' | 'cancelled';

export interface TaskItemData {
  id: string;
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  isTimed: boolean;
  status: TaskStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoodEntryData {
  id: string;
  userId: string;
  moodType: string;
  note?: string;
  tags: string[];
  loggedAt: string;
  createdAt: string;
}

export interface UserProfileData {
  id: string;
  email?: string;
  displayName: string;
  isGuest: boolean;
  selectedCountry?: string;
  themePreference: 'dark' | 'light' | 'system';
  createdAt: string;
}
