import { generateUUID } from '../utils/uuid';
import { IDatabase } from './types';
import {
  Task,
  TaskRow,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilter,
  TaskSummary,
  TaskHistoryAction,
  TaskHistoryEntry,
  TaskHistoryRow,
  TaskStatus,
} from '../types/task';
import { getLocalDateString, isValidDateString, isValidTimeString } from '../utils/date';

/**
 * Records an immutable transition/lifecycle event in the task_history table.
 */
export async function recordTaskHistory(
  db: IDatabase,
  entry: {
    taskId: string;
    action: TaskHistoryAction;
    fromStatus?: TaskStatus | null;
    toStatus?: TaskStatus | null;
    fromDueDate?: string | null;
    toDueDate?: string | null;
    details?: string | null;
    timestamp?: string;
  }
): Promise<void> {
  const historyId = generateUUID();
  const timestamp = entry.timestamp || new Date().toISOString();

  await db.runAsync(
    `INSERT INTO task_history (
      id, task_id, action, from_status, to_status, from_due_date, to_due_date, details, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    historyId,
    entry.taskId,
    entry.action,
    entry.fromStatus ?? null,
    entry.toStatus ?? null,
    entry.fromDueDate ?? null,
    entry.toDueDate ?? null,
    entry.details ?? null,
    timestamp
  );
}

/**
 * Retrieves all chronological history entries for a given task.
 */
export async function getTaskHistory(
  db: IDatabase,
  taskId: string
): Promise<TaskHistoryEntry[]> {
  const rows = await db.getAllAsync<TaskHistoryRow>(
    `SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp ASC;`,
    taskId
  );
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    action: r.action as TaskHistoryAction,
    fromStatus: (r.from_status as TaskStatus) || null,
    toStatus: (r.to_status as TaskStatus) || null,
    fromDueDate: r.from_due_date,
    toDueDate: r.to_due_date,
    details: r.details,
    timestamp: r.timestamp,
  }));
}

/**
 * Maps a SQLite database row to a strongly typed Task domain model.
 */
export function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    dueTime: row.due_time,
    isTimed: row.is_timed === 1,
    status: row.status as Task['status'],
    completedAt: row.completed_at,
    postponedAt: row.postponed_at,
    serverRevision: row.server_revision,
    serverUpdatedAt: row.server_updated_at,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new task in SQLite with monotonic outbox tracking.
 */
export async function createTask(
  db: IDatabase,
  input: CreateTaskInput
): Promise<Task> {
  const trimmedTitle = input.title?.trim();
  if (!trimmedTitle) {
    throw new Error('Task title cannot be empty');
  }
  if (trimmedTitle.length > 255) {
    throw new Error('Task title cannot exceed 255 characters');
  }

  if (input.dueDate && !isValidDateString(input.dueDate)) {
    throw new Error('Invalid due date format. Expected YYYY-MM-DD');
  }
  if (input.dueTime && !isValidTimeString(input.dueTime)) {
    throw new Error('Invalid due time format. Expected HH:MM');
  }

  const id = generateUUID();
  const userId = input.userId || 'guest';
  const description = input.description ? input.description.trim() : null;
  const dueDate = input.dueDate || null;
  const dueTime = input.dueTime || null;
  const isTimed = input.isTimed !== undefined ? input.isTimed : Boolean(dueTime);
  const now = new Date().toISOString();
  const mutationId = generateUUID();

  let createdTask: Task | null = null;

  await db.withTransactionAsync(async () => {
    // 1. Insert into tasks
    await db.runAsync(
      `INSERT INTO tasks (
        id, user_id, title, description, due_date, due_time, is_timed,
        status, completed_at, postponed_at, server_revision, server_updated_at,
        is_deleted, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      userId,
      trimmedTitle,
      description,
      dueDate,
      dueTime,
      isTimed ? 1 : 0,
      'pending',
      null,
      null,
      0,
      now,
      0,
      null,
      now,
      now
    );

    // 2. Append mutation to sync_outbox (base_server_revision = 0 for never-synced local drafts)
    const payload = JSON.stringify({
      id,
      userId,
      title: trimmedTitle,
      description,
      dueDate,
      dueTime,
      isTimed,
      status: 'pending',
    });

    await db.runAsync(
      `INSERT INTO sync_outbox (
        mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      mutationId,
      userId,
      'task',
      id,
      'INSERT',
      0,
      payload,
      now
    );

    // 3. Record creation event in task_history (SPEC 6.5)
    await recordTaskHistory(db, {
      taskId: id,
      action: 'created',
      fromStatus: null,
      toStatus: 'pending',
      fromDueDate: null,
      toDueDate: dueDate,
      details: 'Task created',
      timestamp: now,
    });

    createdTask = await getTaskById(db, id);
    if (!createdTask) {
      throw new Error('Failed to retrieve newly created task');
    }
  });

  return createdTask!;
}

/**
 * Retrieves a single task by its stable UUID.
 */
export async function getTaskById(db: IDatabase, id: string): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>(
    `SELECT * FROM tasks WHERE id = ?;`,
    id
  );
  return row ? mapRowToTask(row) : null;
}

/**
 * Retrieves all tasks for a user, optionally including tombstones.
 */
export async function getAllTasks(
  db: IDatabase,
  options: { userId?: string; includeDeleted?: boolean } = {}
): Promise<Task[]> {
  const userId = options.userId || 'guest';
  const includeDeleted = options.includeDeleted ?? false;

  const query = includeDeleted
    ? `SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC;`
    : `SELECT * FROM tasks WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC;`;

  const rows = await db.getAllAsync<TaskRow>(query, userId);
  return rows.map(mapRowToTask);
}

/**
 * Retrieves filtered tasks based on 'today', 'upcoming', 'all', or 'completed'.
 */
export async function getFilteredTasks(
  db: IDatabase,
  filter: TaskFilter,
  options: { userId?: string; currentDate?: string } = {}
): Promise<Task[]> {
  const userId = options.userId || 'guest';
  const today = options.currentDate || getLocalDateString();

  let query: string;
  let params: any[];

  switch (filter) {
    case 'today':
      // Tasks scheduled for today, or incomplete overdue tasks from earlier dates
      query = `
        SELECT * FROM tasks
        WHERE user_id = ? AND is_deleted = 0
          AND (
            due_date = ?
            OR (due_date < ? AND status = 'pending')
            OR (due_date IS NULL AND status = 'pending' AND substr(created_at, 1, 10) = ?)
          )
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'postponed' THEN 1 ELSE 2 END ASC,
          is_timed DESC,
          CASE WHEN due_time IS NULL THEN 1 ELSE 0 END ASC,
          due_time ASC,
          created_at DESC;
      `;
      params = [userId, today, today, today];
      break;

    case 'upcoming':
      // Pending or postponed tasks scheduled for future dates
      query = `
        SELECT * FROM tasks
        WHERE user_id = ? AND is_deleted = 0
          AND due_date > ?
          AND status IN ('pending', 'postponed')
        ORDER BY due_date ASC, due_time ASC, created_at DESC;
      `;
      params = [userId, today];
      break;

    case 'completed':
      // Completed tasks for history review
      query = `
        SELECT * FROM tasks
        WHERE user_id = ? AND is_deleted = 0 AND status = 'completed'
        ORDER BY completed_at DESC, updated_at DESC;
      `;
      params = [userId];
      break;

    case 'all':
    default:
      // All active tasks
      query = `
        SELECT * FROM tasks
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'postponed' THEN 1 ELSE 2 END ASC,
          CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
          due_date ASC,
          created_at DESC;
      `;
      params = [userId];
      break;
  }

  const rows = await db.getAllAsync<TaskRow>(query, ...params);
  return rows.map(mapRowToTask);
}

/**
 * Updates an existing task with new data and logs history.
 */
export async function updateTask(
  db: IDatabase,
  id: string,
  input: UpdateTaskInput,
  historyOptions?: {
    action?: TaskHistoryAction;
    details?: string | null;
  }
): Promise<Task> {
  const existing = await getTaskById(db, id);
  if (!existing || existing.isDeleted) {
    throw new Error(`Task with id ${id} not found or has been deleted`);
  }

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) {
      throw new Error('Task title cannot be empty');
    }
    if (trimmed.length > 255) {
      throw new Error('Task title cannot exceed 255 characters');
    }
  }

  if (input.dueDate !== undefined && input.dueDate !== null && !isValidDateString(input.dueDate)) {
    throw new Error('Invalid due date format. Expected YYYY-MM-DD');
  }
  if (input.dueTime !== undefined && input.dueTime !== null && !isValidTimeString(input.dueTime)) {
    throw new Error('Invalid due time format. Expected HH:MM');
  }

  const newTitle = input.title !== undefined ? input.title.trim() : existing.title;
  const newDescription = input.description !== undefined ? (input.description ? input.description.trim() : null) : existing.description;
  const newDueDate = input.dueDate !== undefined ? input.dueDate : existing.dueDate;
  const newDueTime = input.dueTime !== undefined ? input.dueTime : existing.dueTime;
  const newIsTimed = input.isTimed !== undefined ? input.isTimed : existing.isTimed;
  const newStatus = input.status !== undefined ? input.status : existing.status;
  const newCompletedAt = input.completedAt !== undefined ? input.completedAt : existing.completedAt;
  const newPostponedAt = input.postponedAt !== undefined ? input.postponedAt : existing.postponedAt;

  const now = new Date().toISOString();
  const mutationId = generateUUID();

  let updatedTask: Task | null = null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET
        title = ?,
        description = ?,
        due_date = ?,
        due_time = ?,
        is_timed = ?,
        status = ?,
        completed_at = ?,
        postponed_at = ?,
        server_updated_at = ?,
        updated_at = ?
      WHERE id = ?;`,
      newTitle,
      newDescription,
      newDueDate,
      newDueTime,
      newIsTimed ? 1 : 0,
      newStatus,
      newCompletedAt,
      newPostponedAt,
      now,
      now,
      id
    );

    const payload = JSON.stringify({
      id,
      title: newTitle,
      description: newDescription,
      dueDate: newDueDate,
      dueTime: newDueTime,
      isTimed: newIsTimed,
      status: newStatus,
      completedAt: newCompletedAt,
      postponedAt: newPostponedAt,
    });

    // Check if there is an unsynced pending INSERT in sync_outbox for this local draft
    const pendingInsert = await db.getFirstAsync<{ client_sequence: number }>(
      `SELECT client_sequence FROM sync_outbox 
       WHERE entity_type = 'task' AND entity_id = ? AND action = 'INSERT' 
       ORDER BY client_sequence DESC LIMIT 1;`,
      id
    );

    if (pendingInsert && existing.serverRevision === 0) {
      // Coalesce edits into the pending INSERT mutation so the server receives
      // a single clean INSERT with the latest state and base_server_revision = 0.
      const coalescedPayload = JSON.stringify({
        id,
        userId: existing.userId,
        title: newTitle,
        description: newDescription,
        dueDate: newDueDate,
        dueTime: newDueTime,
        isTimed: newIsTimed,
        status: newStatus,
        completedAt: newCompletedAt,
        postponedAt: newPostponedAt,
      });

      await db.runAsync(
        `UPDATE sync_outbox SET payload = ? WHERE client_sequence = ?;`,
        coalescedPayload,
        pendingInsert.client_sequence
      );
    } else {
      await db.runAsync(
        `INSERT INTO sync_outbox (
          mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        mutationId,
        existing.userId,
        'task',
        id,
        'UPDATE',
        existing.serverRevision,
        payload,
        now
      );
    }

    // Record transition event in task_history (SPEC 6.5)
    const historyAction: TaskHistoryAction = historyOptions?.action || 'edited';
    await recordTaskHistory(db, {
      taskId: id,
      action: historyAction,
      fromStatus: existing.status,
      toStatus: newStatus,
      fromDueDate: existing.dueDate,
      toDueDate: newDueDate,
      details: historyOptions?.details || (input.title ? `Title: ${newTitle}` : 'Task updated'),
      timestamp: now,
    });

    updatedTask = await getTaskById(db, id);
    if (!updatedTask) {
      throw new Error('Failed to retrieve updated task');
    }
  });

  return updatedTask!;
}

/**
 * Toggles a task's status between 'completed' and 'pending'.
 */
export async function toggleTaskComplete(db: IDatabase, id: string): Promise<Task> {
  const existing = await getTaskById(db, id);
  if (!existing || existing.isDeleted) {
    throw new Error(`Task with id ${id} not found`);
  }

  const isNowCompleted = existing.status !== 'completed';
  const now = new Date().toISOString();

  return updateTask(
    db,
    id,
    {
      status: isNowCompleted ? 'completed' : 'pending',
      completedAt: isNowCompleted ? now : null,
    },
    {
      action: isNowCompleted ? 'completed' : 'uncompleted',
      details: isNowCompleted ? 'Marked complete' : 'Marked incomplete',
    }
  );
}

/**
 * Postpones a task to a new due date.
 */
export async function postponeTask(
  db: IDatabase,
  id: string,
  newDueDate: string,
  newDueTime?: string | null
): Promise<Task> {
  if (!isValidDateString(newDueDate)) {
    throw new Error('Invalid due date for postponing task. Expected YYYY-MM-DD');
  }

  const existing = await getTaskById(db, id);
  if (!existing || existing.isDeleted) {
    throw new Error(`Task with id ${id} not found`);
  }

  const now = new Date().toISOString();
  return updateTask(
    db,
    id,
    {
      dueDate: newDueDate,
      dueTime: newDueTime !== undefined ? newDueTime : null,
      isTimed: Boolean(newDueTime),
      status: 'pending',
      postponedAt: now,
    },
    {
      action: 'postponed',
      details: `Postponed from ${existing.dueDate ?? 'no date'} to ${newDueDate}`,
    }
  );
}

/**
 * Cancels a task without deleting it.
 */
export async function cancelTask(db: IDatabase, id: string): Promise<Task> {
  return updateTask(
    db,
    id,
    {
      status: 'cancelled',
    },
    {
      action: 'cancelled',
      details: 'Task cancelled',
    }
  );
}

/**
 * Soft deletes a task via tombstone (Decision 0.10).
 * Preserves the record with is_deleted = 1 and appends a DELETE mutation.
 */
export async function softDeleteTask(db: IDatabase, id: string): Promise<boolean> {
  const existing = await getTaskById(db, id);
  if (!existing) {
    return false;
  }

  const now = new Date().toISOString();
  const mutationId = generateUUID();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE tasks SET
        is_deleted = 1,
        deleted_at = ?,
        server_updated_at = ?,
        updated_at = ?
      WHERE id = ?;`,
      now,
      now,
      now,
      id
    );

    const payload = JSON.stringify({
      id,
      isDeleted: true,
      deletedAt: now,
    });

    await db.runAsync(
      `INSERT INTO sync_outbox (
        mutation_id, user_id, entity_type, entity_id, action, base_server_revision, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      mutationId,
      existing.userId,
      'task',
      id,
      'DELETE',
      existing.serverRevision,
      payload,
      now
    );

    // Record soft deletion in task_history (SPEC 6.5)
    await recordTaskHistory(db, {
      taskId: id,
      action: 'deleted',
      fromStatus: existing.status,
      toStatus: null,
      fromDueDate: existing.dueDate,
      toDueDate: null,
      details: 'Task soft-deleted (tombstone)',
      timestamp: now,
    });
  });

  return true;
}

/**
 * Returns today's summary metrics (total, completed, remaining, overdue).
 */
export async function getTodaySummary(
  db: IDatabase,
  currentDate: string = getLocalDateString(),
  userId: string = 'guest'
): Promise<TaskSummary> {
  // Query today's tasks + overdue tasks
  const tasks = await getFilteredTasks(db, 'today', { userId, currentDate });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const remaining = total - completed;

  // Overdue count: tasks with due_date < today and not completed
  const overdueRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE user_id = ? AND is_deleted = 0
       AND due_date < ? AND status = 'pending';`,
    userId,
    currentDate
  );

  return {
    total,
    completed,
    remaining,
    overdue: overdueRow?.count ?? 0,
  };
}
