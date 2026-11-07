import * as Notifications from 'expo-notifications';
import { getDatabase } from '../db/client';
import { IDatabase } from '../db/types';
import { getOrCreateCheckinOccurrence } from '../db/checkinRepository';
import { CheckinType } from '../types/checkin';
import { Conversation } from '../types/chat';
import { CHECKIN_NAMESPACE, CheckinNotificationPayload } from './checkinScheduler';

// In-memory duplicate processing cache (notification id / key -> timestamp)
const recentProcessedTaps = new Map<string, { timestamp: number; conversationId: string }>();
const TAP_DEDUPLICATION_WINDOW_MS = 5000;

export interface HandledNotificationTapResult {
  handled: boolean;
  checkinType?: CheckinType;
  intendedDate?: string;
  conversation?: Conversation;
  wasRecovered?: boolean;
  wasCreated?: boolean;
}

/**
 * Validates whether a notification response belongs to Cura's check-in scheduler.
 */
export function isCheckinNotificationPayload(
  data: any
): data is CheckinNotificationPayload {
  return (
    data !== null &&
    typeof data === 'object' &&
    data.curaNamespace === CHECKIN_NAMESPACE &&
    (data.checkinType === 'morning' || data.checkinType === 'evening') &&
    typeof data.intendedDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.intendedDate)
  );
}

/**
 * Handles a notification tap response.
 * - Extracts and validates check-in payload.
 * - Adheres strictly to the stale notification rule: opens reflection for original intendedDate.
 * - Combines in-memory deduplication with persistent SQLite get-or-create occurrence idempotency.
 * - Returns the resolved conversation to allow caller to navigate to the chat room.
 */
export async function handleCheckinNotificationResponse(
  response: Notifications.NotificationResponse,
  userId = 'guest',
  customDb?: IDatabase
): Promise<HandledNotificationTapResult> {
  const data = response?.notification?.request?.content?.data;

  if (!isCheckinNotificationPayload(data)) {
    return { handled: false };
  }

  const { checkinType, intendedDate } = data;
  const notifId = response.notification.request.identifier;
  const tapKey = `${checkinType}:${intendedDate}:${notifId}`;
  const now = Date.now();

  const db = customDb ?? (await getDatabase());

  // In-memory guard for rapid duplicate tap events
  const cached = recentProcessedTaps.get(tapKey);
  if (cached && now - cached.timestamp < TAP_DEDUPLICATION_WINDOW_MS) {
    const result = await getOrCreateCheckinOccurrence(db, {
      userId,
      checkinType,
      localDate: intendedDate,
    });

    return {
      handled: true,
      checkinType,
      intendedDate,
      conversation: result.conversation,
      wasRecovered: result.wasRecovered,
      wasCreated: false,
    };
  }

  // Persistent database resolution
  const result = await getOrCreateCheckinOccurrence(db, {
    userId,
    checkinType,
    localDate: intendedDate,
  });

  // Record into deduplication map
  recentProcessedTaps.set(tapKey, {
    timestamp: now,
    conversationId: result.conversation.id,
  });

  // Clean old entries
  for (const [key, val] of recentProcessedTaps.entries()) {
    if (now - val.timestamp > TAP_DEDUPLICATION_WINDOW_MS * 2) {
      recentProcessedTaps.delete(key);
    }
  }

  return {
    handled: true,
    checkinType,
    intendedDate,
    conversation: result.conversation,
    wasRecovered: result.wasRecovered,
    wasCreated: result.wasCreated,
  };
}

export const __responseHandlerTestHelpers = {
  resetCache: () => recentProcessedTaps.clear(),
  getCacheSize: () => recentProcessedTaps.size,
};
