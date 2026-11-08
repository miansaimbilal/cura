import { MoodType } from '../../types/mood';
import { TaskStatus } from '../../types/task';

/**
 * Single task summary item inside the widget snapshot.
 */
export interface WidgetTaskItem {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  isTimed: boolean;
  status: TaskStatus;
  completedAt: string | null;
}

/**
 * Task aggregate metrics in widget snapshot.
 */
export interface WidgetTasksSummary {
  todayTotal: number;
  todayCompleted: number;
  todayRemaining: number;
  overdueCount: number;
  items: WidgetTaskItem[];
}

/**
 * Latest logged mood in widget snapshot.
 */
export interface WidgetMoodSummary {
  latestMoodType: MoodType | null;
  latestLoggedAt: string | null;
}

/**
 * Rotating quote in widget snapshot.
 */
export interface WidgetQuote {
  id: string;
  text: string;
  author: string;
}

/**
 * Authoritative JSON structure for Cura home-screen widgets.
 */
export interface WidgetSnapshot {
  schemaVersion: number;
  revision: number;
  sourceRevision: number;
  userId: string;
  accountEpoch: number;
  generatedAt: string;
  tasks: WidgetTasksSummary;
  mood: WidgetMoodSummary;
  quote: WidgetQuote;
}

/**
 * Singleton metadata row from widget_snapshot_metadata table.
 */
export interface WidgetSnapshotMetadata {
  id: number;
  source_revision: number;
  published_revision: number;
  account_epoch: number;
  user_id: string | null;
  updated_at: string;
}

/**
 * Input for applying a widget action.
 */
export interface WidgetActionInput {
  actionId: string;
  userId: string;
  actionType: 'task_toggle' | 'mood_log';
  targetId: string;
  requestedState: string;
  clientActionTime: string;
}

/**
 * Processed action ledger row from processed_actions table.
 */
export interface ProcessedActionRow {
  action_id: string;
  user_id: string;
  action_type: 'task_toggle' | 'mood_log';
  target_id: string;
  requested_state: string;
  applied_state: string | null;
  status: 'applied' | 'no_op' | 'rejected';
  rejection_reason: string | null;
  payload_hash: string;
  client_action_time: string;
  created_at: string;
}

/**
 * Result returned after evaluating or applying a widget action.
 */
export interface ActionResult {
  actionId: string;
  status: 'applied' | 'no_op' | 'rejected';
  appliedState: string | null;
  rejectionReason: string | null;
  isDuplicate: boolean;
}

/**
 * Result returned by the JS publish orchestrator.
 */
export interface PublishResult {
  published: boolean;
  skippedReason?: 'UP_TO_DATE' | 'PUBLISHER_FAILED' | 'ERROR';
  snapshot?: WidgetSnapshot;
  publishedRevision?: number;
}
