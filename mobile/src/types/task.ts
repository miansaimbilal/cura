export type TaskStatus = 'pending' | 'completed' | 'postponed' | 'cancelled';

export type TaskFilter = 'today' | 'upcoming' | 'all' | 'completed';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  dueDate: string | null; // Format: YYYY-MM-DD
  dueTime: string | null; // Format: HH:MM
  isTimed: boolean;
  status: TaskStatus;
  completedAt: string | null; // ISO 8601
  postponedAt: string | null; // ISO 8601
  serverRevision: number;
  serverUpdatedAt: string; // ISO 8601
  isDeleted: boolean;
  deletedAt: string | null; // ISO 8601
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  is_timed: number; // 0 or 1
  status: string;
  completed_at: string | null;
  postponed_at: string | null;
  server_revision: number;
  server_updated_at: string;
  is_deleted: number; // 0 or 1
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  dueDate?: string | null; // YYYY-MM-DD
  dueTime?: string | null; // HH:MM
  isTimed?: boolean;
  userId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  isTimed?: boolean;
  status?: TaskStatus;
  completedAt?: string | null;
  postponedAt?: string | null;
}

export interface TaskSummary {
  total: number;
  completed: number;
  remaining: number;
  overdue: number;
}

export type TaskHistoryAction =
  | 'created'
  | 'completed'
  | 'uncompleted'
  | 'postponed'
  | 'cancelled'
  | 'edited'
  | 'deleted';

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  action: TaskHistoryAction;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  fromDueDate: string | null;
  toDueDate: string | null;
  details: string | null;
  timestamp: string; // ISO 8601
}

export interface TaskHistoryRow {
  id: string;
  task_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  from_due_date: string | null;
  to_due_date: string | null;
  details: string | null;
  timestamp: string;
}
