import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/index';
import { userPreferences } from '../../db/schema/userPreferences';
import { tasks } from '../../db/schema/tasks';
import { moodEntries } from '../../db/schema/moodEntries';
import { conversationSummaries } from '../../db/schema/conversationSummaries';
import type { AIMessage } from '../ai/types';
import { isValidCalendarDate } from './chat.schema';

export interface ChatContextOptions {
  userId: string;
  conversationId: string;
  clientLocalDate?: string;
}

export class ChatContextBuilder {
  /**
   * Constructs the full system context instructions for Cura's conversational AI companion.
   * Respects user privacy controls (aiIncludeTasks, aiIncludeMoods), bounds context,
   * enforces safety and non-judgmental tone, and incorporates conversation summaries.
   */
  public async buildSystemContext(options: ChatContextOptions): Promise<AIMessage> {
    const { userId, conversationId } = options;

    // 1. Fetch user preferences
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    const includeTasks = prefs?.aiIncludeTasks ?? true;
    const includeMoods = prefs?.aiIncludeMoods ?? true;

    // 2. Base Persona & Behavioral Safety Instructions
    const sections: string[] = [];

    sections.push(
      `You are Cura, a gentle, thoughtful, and empathetic AI companion for reflection and daily life.
Your role is to offer supportive, calm conversation without being clinical, robotic, or overly enthusiastic.
Core principles you must follow at all times:
- Non-judgmental: Never induce guilt, shame, or pressure over overdue tasks, missed goals, or low moods.
- Supportive: Validate feelings and celebrate small wins with genuine warmth, without exaggerated praise.
- Respect Boundaries: You are a compassionate companion, NOT a doctor, therapist, or emergency responder. Never provide medical diagnoses or psychological labels. AI chat is never a substitute for emergency services or professional support.
- Crisis Safety & Immediate Danger: If the user expresses thoughts of self-harm, suicide, severe distress, or immediate danger:
  * Prioritize immediate physical safety above all else. Respond calmly, compassionately, and without judgment.
  * For immediate danger, urge the user to contact their local emergency services immediately or go to the nearest emergency department.
  * Encourage contacting a trusted family member, friend, or professional who can be physically present.
  * Do not assume the user is in the United States, Canada, or any particular country. Never present 988 or any single country-specific number as globally applicable.
  * Recommend https://findahelpline.com/ so the user can locate free, confidential, country-specific crisis support.
  * Use country-specific numbers (such as 988 in the US/Canada) only if the user explicitly mentions their country and the resource's applicability is established. Never invent emergency numbers, hotlines, or operating hours.
- Data Autonomy: User tasks and mood records are the ground truth. You cannot modify, complete, create, or delete tasks or mood entries. Do not invent details not present in the user's data.`
    );

    // 3. User Task Context (if permitted)
    if (includeTasks) {
      const taskContext = await this.getTaskContext(userId, options.clientLocalDate);
      if (taskContext) {
        sections.push(`\n[PERMITTED USER TASK CONTEXT]\n${taskContext}`);
      }
    } else {
      sections.push(`\n[TASK CONTEXT: User has disabled task sharing. Do not reference their task list.]`);
    }

    // 4. User Mood Context (if permitted)
    if (includeMoods) {
      const moodContext = await this.getMoodContext(userId);
      if (moodContext) {
        sections.push(`\n[PERMITTED USER MOOD CONTEXT]\n${moodContext}`);
      }
    } else {
      sections.push(`\n[MOOD CONTEXT: User has disabled mood sharing. Do not reference their mood entries.]`);
    }

    // 5. Prior Conversation Summary (if available)
    const [summary] = await db
      .select()
      .from(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.conversationId, conversationId),
          eq(conversationSummaries.userId, userId)
        )
      )
      .limit(1);

    if (summary?.summaryText) {
      sections.push(
        `\n[PREVIOUS CONVERSATION SUMMARY]\n${summary.summaryText}\n(Use this summary for continuity. Do not claim to remember facts not stated here or in the messages.)`
      );
    }

    return {
      role: 'system',
      content: sections.join('\n'),
    };
  }

  private async getTaskContext(userId: string, clientLocalDate?: string): Promise<string | null> {
    try {
      // Use validated clientLocalDate from client; fallback to documented UTC if absent
      const todayStr =
        clientLocalDate && isValidCalendarDate(clientLocalDate)
          ? clientLocalDate
          : new Date().toISOString().split('T')[0];

      // Query active tasks for today or overdue
      const userTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueDate: tasks.dueDate,
          dueTime: tasks.dueTime,
          isDeleted: tasks.isDeleted,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.isDeleted, false)
          )
        )
        .orderBy(desc(tasks.createdAt))
        .limit(20);

      if (userTasks.length === 0) {
        return 'The user currently has no recorded tasks in their list.';
      }

      const completedToday = userTasks.filter(
        (t) => t.status === 'completed' && (!t.dueDate || t.dueDate === todayStr)
      );
      const pendingToday = userTasks.filter(
        (t) => t.status === 'pending' && t.dueDate === todayStr
      );
      const overdue = userTasks.filter(
        (t) => t.status === 'pending' && t.dueDate && t.dueDate < todayStr
      );

      const parts: string[] = [];
      if (completedToday.length > 0) {
        parts.push(`Completed today (${completedToday.length}): ${completedToday.slice(0, 3).map((t) => `"${t.title}"`).join(', ')}`);
      }
      if (pendingToday.length > 0) {
        parts.push(`Scheduled for today (${pendingToday.length}): ${pendingToday.slice(0, 3).map((t) => `"${t.title}"`).join(', ')}`);
      }
      if (overdue.length > 0) {
        parts.push(`Earlier open tasks (${overdue.length}): ${overdue.slice(0, 2).map((t) => `"${t.title}"`).join(', ')}`);
      }

      return parts.length > 0 ? parts.join(' | ') : 'No scheduled tasks for today.';
    } catch {
      return null;
    }
  }

  private async getMoodContext(userId: string): Promise<string | null> {
    try {
      const recentMoods = await db
        .select({
          id: moodEntries.id,
          moodType: moodEntries.moodType,
          note: moodEntries.note,
          loggedAt: moodEntries.loggedAt,
          isDeleted: moodEntries.isDeleted,
        })
        .from(moodEntries)
        .where(
          and(
            eq(moodEntries.userId, userId),
            eq(moodEntries.isDeleted, false)
          )
        )
        .orderBy(desc(moodEntries.loggedAt))
        .limit(2);

      if (recentMoods.length === 0) {
        return 'No recent mood entries recorded.';
      }

      const latest = recentMoods[0];
      let summary = `Latest logged feeling: "${latest.moodType}" at ${latest.loggedAt}`;
      if (latest.note && latest.note.trim()) {
        summary += ` (Reflection note: "${latest.note.trim().slice(0, 100)}")`;
      }

      return summary;
    } catch {
      return null;
    }
  }
}
