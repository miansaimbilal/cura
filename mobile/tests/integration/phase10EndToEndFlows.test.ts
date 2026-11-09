import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask, toggleTaskComplete, getTaskById, getAllTasks } from '../../src/db/taskRepository';
import { createMoodEntry, getMoodDistribution } from '../../src/db/moodRepository';
import { createConversation, createMessage, getMessages } from '../../src/db/chatRepository';
import { getOrCreateCheckinOccurrence } from '../../src/db/checkinRepository';
import { buildWidgetSnapshot } from '../../src/services/widgets/snapshotBuilder';
import { handleWidgetDeepLink } from '../../src/services/widgets/widgetDeepLink';
import {
  updateNotificationCategory,
  NotificationPreferences,
} from '../../src/services/notificationPreferences';
import {
  getAISettings,
  saveAISettings,
} from '../../src/services/aiSettingsService';
import {
  exportUserDataJson,
  exportUserDataCsv,
  vacuumDatabase,
  deleteMyData,
} from '../../src/services/dataExportService';
import { getCrisisDirectory, CRISIS_DISCLAIMER_TEXT } from '../../src/services/crisisSupportService';
import { migrateGuestDataToUser } from '../../src/services/auth/sessionService';
import {
  storeTokens,
  getStoredTokens,
  clearStoredTokens,
  getValidAccessToken,
} from '../../src/services/auth/authContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In-memory mock for SecureStore
const secureStorage = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStorage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStorage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStorage.delete(key);
  }),
}));

function makeJwt(expSecondsFromNow: number, userId: string = 'usr_int_test'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email: 'user@cura.app',
      iat: now,
      exp: now + expSecondsFromNow,
    })
  ).toString('base64url');
  return `${header}.${payload}.mockSignature`;
}

describe('Phase 10: Complete Integration Flows End-to-End', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
    secureStorage.clear();
    await AsyncStorage.clear();
  });

  it('Flow 1: Guest complete flow (open app -> task lifecycle -> mood -> analytics -> chat -> checkin -> widget)', async () => {
    const guestId = 'guest';
    const today = '2026-11-09';

    // 1. Open app & create task
    const task = await createTask(db, {
      userId: guestId,
      title: 'Buy groceries',
      dueDate: today,
      dueTime: '10:00',
    });
    expect(task.id).toBeDefined();
    expect(task.status).toBe('pending');

    // 2. Complete task
    const completedTask = await toggleTaskComplete(db, task.id);
    expect(completedTask.status).toBe('completed');
    expect(completedTask.completedAt).toBeDefined();

    // 3. Log mood
    const mood = await createMoodEntry(db, {
      userId: guestId,
      moodType: 'calm',
      loggedAt: `${today}T11:00:00.000Z`,
      note: 'Feeling centered and relaxed',
    });
    expect(mood.id).toBeDefined();
    expect(mood.moodType).toBe('calm');

    // 4. Check analytics
    const moodDist = await getMoodDistribution(
      db,
      `${today}T00:00:00.000Z`,
      `${today}T23:59:59.999Z`,
      guestId
    );
    expect(moodDist.total).toBe(1);
    expect(moodDist.mostFrequentMood).toBe('calm');

    // 5. Chat reflection
    const convo = await createConversation(db, {
      userId: guestId,
      title: 'Morning Reflection',
    });
    await createMessage(db, {
      conversationId: convo.id,
      sender: 'user',
      content: 'I finished my morning task and feel calm.',
    });
    await createMessage(db, {
      conversationId: convo.id,
      sender: 'assistant',
      content: 'That is wonderful to hear. A great start to the day!',
    });
    const allMessages = await getMessages(db, convo.id);
    expect(allMessages.length).toBe(2);

    // 6. Check-in occurrence
    const checkinResult = await getOrCreateCheckinOccurrence(db, {
      userId: guestId,
      checkinType: 'morning',
      localDate: today,
    });
    expect(checkinResult.occurrence.id).toBeDefined();
    expect(checkinResult.occurrence.localDate).toBe(today);

    // 7. Widget shows updated snapshot
    const snapshot = await buildWidgetSnapshot(db, {
      userId: guestId,
      currentDate: today,
    });
    expect(snapshot.tasks.todayTotal).toBe(1);
    expect(snapshot.tasks.todayCompleted).toBe(1);
    expect(snapshot.mood.latestMoodType).toBe('calm');
  });

  it('Flow 2: Auth complete flow (register -> migrate -> logout -> login -> token refresh -> restore -> delete data)', async () => {
    const guestId = 'guest';
    const authedUserId = 'usr_flow2_registered';
    const today = '2026-11-09';

    // Step A: Seed initial guest data
    const guestTask = await createTask(db, {
      userId: guestId,
      title: 'Guest pre-auth task',
      dueDate: today,
    });
    await createMoodEntry(db, {
      userId: guestId,
      moodType: 'happy',
      loggedAt: new Date().toISOString(),
    });

    // Step B: Register & migrate guest data
    const initialAccessToken = makeJwt(3600, authedUserId);
    const initialRefreshToken = 'mock_refresh_token_valid';
    await storeTokens(initialAccessToken, initialRefreshToken, {
      id: authedUserId,
      email: 'user@cura.app',
    });

    const migrationResult = await migrateGuestDataToUser(db, authedUserId);
    expect(migrationResult.userId).toBe(authedUserId);
    expect(migrationResult.accountEpoch).toBeGreaterThan(0);

    // Verify task is now owned by authenticated user
    const migratedTask = await getTaskById(db, guestTask.id);
    expect(migratedTask?.userId).toBe(authedUserId);

    // Step C: Logout (tokens cleared)
    await clearStoredTokens();
    const tokensAfterLogout = await getStoredTokens();
    expect(tokensAfterLogout.accessToken).toBeNull();
    expect(tokensAfterLogout.refreshToken).toBeNull();

    // Step D: Login again & verify token storage
    const newAccessToken = makeJwt(30, authedUserId); // short expiry: 30s (<60s triggers refresh)
    const newRefreshToken = 'mock_refresh_v2';
    await storeTokens(newAccessToken, newRefreshToken, {
      id: authedUserId,
      email: 'user@cura.app',
    });

    // Step E: Token refresh when JWT < 60s
    // Mock the refresh endpoint
    const refreshedJwt = makeJwt(3600, authedUserId);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          accessToken: refreshedJwt,
          refreshToken: 'mock_refresh_v3',
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch as any);

    const validToken = await getValidAccessToken();
    expect(validToken).toBe(refreshedJwt);
    vi.unstubAllGlobals();

    // Step F: Cold-start restore
    const restoredTokens = await getStoredTokens();
    expect(restoredTokens.accessToken).toBe(refreshedJwt);
    expect(restoredTokens.user?.id).toBe(authedUserId);

    // Step G: Delete user data
    const deleteResult = await deleteMyData(db, authedUserId);
    expect(deleteResult.success).toBe(true);

    const tasksAfterDelete = await getAllTasks(db, { userId: authedUserId });
    expect(tasksAfterDelete.length).toBe(0);

    // Step H: Tokens cleared back to guest state
    const finalTokens = await getStoredTokens();
    expect(finalTokens.accessToken).toBeNull();
  });

  it('Flow 3: Settings complete flow (theme -> notification categories -> AI settings -> export JSON/CSV -> VACUUM -> crisis)', async () => {
    const userId = 'usr_flow3_settings';
    const today = '2026-11-09';

    // 1. Theme cycling: Dark -> Light -> System
    await AsyncStorage.setItem('@cura_theme_mode', 'light');
    let themeSetting = await AsyncStorage.getItem('@cura_theme_mode');
    expect(themeSetting).toBe('light');

    await AsyncStorage.setItem('@cura_theme_mode', 'system');
    themeSetting = await AsyncStorage.getItem('@cura_theme_mode');
    expect(themeSetting).toBe('system');

    await AsyncStorage.setItem('@cura_theme_mode', 'dark');
    themeSetting = await AsyncStorage.getItem('@cura_theme_mode');
    expect(themeSetting).toBe('dark');

    // 2. Notification categories: toggle all 6 independently
    const categories: (keyof NotificationPreferences)[] = [
      'timedTaskReminders',
      'endOfDayReminders',
      'morningCheckin',
      'eveningCheckin',
      'accomplishments',
      'aiInsights',
    ];

    for (const cat of categories) {
      const updated = await updateNotificationCategory(cat, false);
      expect(updated[cat]).toBe(false);
      const reenabled = await updateNotificationCategory(cat, true);
      expect(reenabled[cat]).toBe(true);
    }

    // 3. AI provider setting change
    await saveAISettings({
      selectedProvider: 'groq',
      selectedModel: 'llama-3.3-70b-versatile',
      backgroundPriority: ['groq', 'gemini', 'openrouter'],
    });
    const loadedAi = await getAISettings();
    expect(loadedAi.selectedProvider).toBe('groq');
    expect(loadedAi.selectedModel).toBe('llama-3.3-70b-versatile');

    // 4. Export JSON & CSV
    await createTask(db, { userId, title: 'Exportable task', dueDate: today });
    await createMoodEntry(db, { userId, moodType: 'excited', loggedAt: new Date().toISOString() });

    const jsonExport = await exportUserDataJson(db, userId);
    const parsed = JSON.parse(jsonExport);
    expect(parsed.exportVersion).toBe('1.0');
    expect(parsed.data.tasks.length).toBe(1);
    expect(parsed.data.moodEntries.length).toBe(1);

    const csvExport = await exportUserDataCsv(db, userId);
    expect(csvExport).toContain('=== TASKS ===');
    expect(csvExport).toContain('=== MOOD_ENTRIES ===');
    expect(csvExport).toContain('Exportable task');

    // 5. Database VACUUM
    await expect(vacuumDatabase(db)).resolves.not.toThrow();

    // 6. Crisis screen verification (Pakistan-first directory)
    const pkDirectory = getCrisisDirectory('PK');
    expect(pkDirectory.countryCode).toBe('PK');
    expect(pkDirectory.emergencyNumber).toBe('1122');
    expect(pkDirectory.helplines.length).toBeGreaterThanOrEqual(4);
    expect(CRISIS_DISCLAIMER_TEXT).toContain('Cura is an AI wellbeing companion');
  });

  it('Flow 4: Widgets complete flow (task X/Y -> deep link toggle -> widget refresh -> no double-toggle)', async () => {
    const userId = 'usr_flow4_widgets';
    const today = '2026-11-09';

    // 1. Create two tasks: Task 1 and Task 2
    const task1 = await createTask(db, {
      userId,
      title: 'Task 1 - Workout',
      dueDate: today,
      dueTime: '08:00',
    });
    await createTask(db, {
      userId,
      title: 'Task 2 - Read book',
      dueDate: today,
      dueTime: '18:00',
    });

    // 2. Initial widget snapshot shows 0/2
    const initialSnapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(initialSnapshot.tasks.todayTotal).toBe(2);
    expect(initialSnapshot.tasks.todayCompleted).toBe(0);

    // 3. User taps checkbox on Task 1 in home-screen widget
    // Generates deep link: cura://widget-action?action_type=task_toggle&target_id=...
    const actionId = 'act_widget_toggle_t1';
    const clientActionTime = new Date().toISOString();
    const deepLinkUrl = `cura://widget-action?action_id=${actionId}&action_type=task_toggle&target_id=${task1.id}&requested_state=completed&user_id=${userId}&client_action_time=${encodeURIComponent(clientActionTime)}`;

    // 4. App handles deep link
    const handleResult = await handleWidgetDeepLink(db, deepLinkUrl, { activeUserId: userId });
    expect(handleResult.handled).toBe(true);
    expect(handleResult.actionResult?.status).toBe('applied');
    expect(handleResult.actionResult?.isDuplicate).toBe(false);

    // Verify task is now completed
    const updatedTask1 = await getTaskById(db, task1.id);
    expect(updatedTask1?.status).toBe('completed');

    // 5. Widget snapshot refreshed -> shows 1/2
    const refreshedSnapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(refreshedSnapshot.tasks.todayTotal).toBe(2);
    expect(refreshedSnapshot.tasks.todayCompleted).toBe(1);

    // 6. Double-toggle prevention: Duplicate deep link delivered (e.g. Android Intent redelivery or multiple taps)
    const duplicateResult = await handleWidgetDeepLink(db, deepLinkUrl, { activeUserId: userId });
    // Action already exists in processed_actions with same hash -> idempotent receipt returned, isDuplicate: true
    expect(duplicateResult.handled).toBe(true);
    expect(duplicateResult.actionResult?.status).toBe('applied');
    expect(duplicateResult.actionResult?.isDuplicate).toBe(true);

    // Task 1 remains completed, does NOT toggle back to pending!
    const taskAfterDuplicate = await getTaskById(db, task1.id);
    expect(taskAfterDuplicate?.status).toBe('completed');

    // Widget snapshot still accurately reflects 1/2
    const postDuplicateSnapshot = await buildWidgetSnapshot(db, { userId, currentDate: today });
    expect(postDuplicateSnapshot.tasks.todayCompleted).toBe(1);
  });
});
