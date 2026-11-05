export type MoodType =
  | 'happy'
  | 'calm'
  | 'excited'
  | 'okay'
  | 'tired'
  | 'stressed'
  | 'sad'
  | 'anxious'
  | 'angry';

export interface MoodEntry {
  id: string;
  userId: string;
  moodType: MoodType;
  note: string | null;
  tags: string[];
  loggedAt: string; // ISO 8601 string
  serverRevision: number; // 0 for unsynced local drafts
  serverUpdatedAt: string | null; // strictly null until server-synced
  isDeleted: boolean;
  deletedAt: string | null; // ISO 8601 string
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
}

export interface MoodEntryRow {
  id: string;
  user_id: string;
  mood_type: string;
  note: string | null;
  tags: string; // JSON string in SQLite
  logged_at: string;
  server_revision: number;
  server_updated_at: string | null;
  is_deleted: number; // 0 or 1
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMoodInput {
  moodType: MoodType;
  note?: string | null;
  tags?: string[];
  loggedAt?: string; // Optional custom time; defaults to now
  userId?: string;
}

export interface UpdateMoodInput {
  moodType?: MoodType;
  note?: string | null;
  tags?: string[];
  loggedAt?: string;
}

export interface MoodDistributionItem {
  moodType: MoodType;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface MoodDistribution {
  total: number;
  items: MoodDistributionItem[];
  mostFrequentMood: MoodType | null;
}
