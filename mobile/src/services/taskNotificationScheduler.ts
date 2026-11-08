import * as Notifications from 'expo-notifications';
import { IDatabase } from '../db/types';
import { Task } from '../types/task';
import {
  getNotificationPreferences,
  isTimeInQuietHours,
} from './notificationPreferences';
import { getLocalDateString } from '../utils/date';

export const TASK_REMINDER_PREFIX = 'cura_task_reminder_';
export const EOD_REMINDER_IDENTIFIER = 'cura_eod_reminder';

/**
 * Builds notification identifier for a task.
 */
export function getTaskNotificationIdentifier(taskId: string): string {
  return `${TASK_REMINDER_PREFIX}${taskId}`;
}

/**
 * Schedules a local notification for an upcoming timed task if timedTaskReminders is enabled.
 */
export async function scheduleTaskReminder(task: Task): Promise<boolean> {
  // If task is completed, cancelled, or soft-deleted, ensure any prior reminder is cancelled
  if (task.status === 'completed' || task.status === 'cancelled' || task.isDeleted) {
    await cancelTaskReminder(task.id);
    return false;
  }

  if (!task.isTimed || !task.dueDate || !task.dueTime) {
    return false;
  }

  const prefs = await getNotificationPreferences();
  if (!prefs.timedTaskReminders) {
    return false;
  }

  // Check quiet hours
  if (
    isTimeInQuietHours(
      task.dueTime,
      prefs.quietHoursStart,
      prefs.quietHoursEnd,
      prefs.quietHoursEnabled
    )
  ) {
    // Suppressed during quiet hours
    return false;
  }

  try {
    const targetDate = new Date(`${task.dueDate}T${task.dueTime}:00`);
    if (isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
      return false;
    }

    const identifier = getTaskNotificationIdentifier(task.id);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Task Reminder',
        body: task.title,
        data: {
          taskId: task.id,
          type: 'timed_task_reminder',
        },
      },
      trigger: targetDate as any,
    });
    return true;
  } catch (err) {
    console.warn('[taskNotificationScheduler] Failed to schedule reminder for task:', task.id, err);
    return false;
  }
}

/**
 * Cancels scheduled reminder for a specific task.
 */
export async function cancelTaskReminder(taskId: string): Promise<void> {
  try {
    const identifier = getTaskNotificationIdentifier(taskId);
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Graceful fallback
  }
}

/**
 * Reschedules or cancels all upcoming timed tasks based on current notification preferences.
 */
export async function rescheduleAllTaskReminders(db: IDatabase): Promise<number> {
  const prefs = await getNotificationPreferences();

  // If timed task reminders are turned off, cancel all existing task notifications
  if (!prefs.timedTaskReminders) {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier.startsWith(TASK_REMINDER_PREFIX)) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  // Fetch pending timed tasks
  const today = getLocalDateString();
  const tasks = await db.getAllAsync<any>(
    `SELECT * FROM tasks
     WHERE is_deleted = 0
       AND status = 'pending'
       AND is_timed = 1
       AND due_date IS NOT NULL
       AND due_date >= ?
       AND due_time IS NOT NULL;`,
    today
  );

  let scheduledCount = 0;
  for (const row of tasks) {
    const task: Task = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      dueTime: row.due_time,
      isTimed: Boolean(row.is_timed),
      status: row.status,
      completedAt: row.completed_at,
      postponedAt: row.postponed_at,
      serverRevision: row.server_revision,
      serverUpdatedAt: row.server_updated_at,
      isDeleted: Boolean(row.is_deleted),
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const scheduled = await scheduleTaskReminder(task);
    if (scheduled) scheduledCount++;
  }

  return scheduledCount;
}

/**
 * Schedules or cancels End-of-Day task review notification.
 */
export async function syncEndOfDayReminder(db: IDatabase): Promise<boolean> {
  const prefs = await getNotificationPreferences();
  try {
    await Notifications.cancelScheduledNotificationAsync(EOD_REMINDER_IDENTIFIER);
  } catch {
    // Ignore
  }

  if (!prefs.endOfDayReminders) {
    return false;
  }

  const [hours, minutes] = prefs.endOfDayTime.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target.getTime() <= now.getTime()) {
    // Schedule for tomorrow if already passed today
    target.setDate(target.getDate() + 1);
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: EOD_REMINDER_IDENTIFIER,
      content: {
        title: 'End of Day Reflection',
        body: 'Take a calm moment to review your accomplishments and wrap up today.',
        data: { type: 'end_of_day_reminder' },
      },
      trigger: target as any,
    });
    return true;
  } catch {
    return false;
  }
}
