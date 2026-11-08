import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask, toggleTaskComplete, softDeleteTask } from '../../src/db/taskRepository';
import { createMoodEntry } from '../../src/db/moodRepository';
import { createConversation, createMessage } from '../../src/db/chatRepository';
import { getOrCreateCheckinOccurrence } from '../../src/db/checkinRepository';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  updateNotificationCategory,
  getCheckinPreferences,
  saveCheckinPreferences,
  isTimeInQuietHours,
  NOTIFICATION_PREFERENCES_KEY,
} from '../../src/services/notificationPreferences';
import {
  scheduleTaskReminder,
  cancelTaskReminder,
  getTaskNotificationIdentifier,
} from '../../src/services/taskNotificationScheduler';
import {
  exportUserDataJson,
  exportUserDataCsv,
  getDatabaseStorageStats,
  vacuumDatabase,
  deleteMyData,
} from '../../src/services/dataExportService';
import {
  getCrisisDirectory,
  CRISIS_DISCLAIMER_TEXT,
  TRUSTED_PERSON_PROMPT,
} from '../../src/services/crisisSupportService';
import { createTheme } from '../../src/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import fs from 'node:fs';
import path from 'node:path';

// In-memory SecureStore mock
const secureStorage = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStorage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStorage.set(key, String(value));
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStorage.delete(key);
  }),
}));

// In-memory Share mock
vi.mock('react-native/Libraries/Share/Share', () => ({
  default: {
    share: vi.fn().mockResolvedValue({ action: 'sharedAction' }),
  },
}));

describe('SPEC Phase 9: Settings, Privacy, and Notifications Integration Tests', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    (AsyncStorage as any).__reset();
    secureStorage.clear();
    (Notifications as any).__mockHelpers?.reset();

    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);

    // Initial widget metadata
    await db.runAsync(
      `UPDATE widget_snapshot_metadata
       SET user_id = 'usr_phase9', account_epoch = 1, source_revision = 0, published_revision = 0
       WHERE id = 1;`
    );
  });

  describe('1. Theme tokens and mode resolution', () => {
    it('generates dark and light theme palettes with consistent token shapes', () => {
      const darkTheme = createTheme('dark');
      const lightTheme = createTheme('light');

      expect(darkTheme.mode).toBe('dark');
      expect(lightTheme.mode).toBe('light');

      // Tokens must be fully defined
      expect(darkTheme.colors.background).toBeDefined();
      expect(lightTheme.colors.background).toBeDefined();
      expect(darkTheme.colors.textPrimary).toBeDefined();
      expect(lightTheme.colors.textPrimary).toBeDefined();
      expect(darkTheme.colors.surface).toBeDefined();
      expect(lightTheme.colors.surface).toBeDefined();

      // Palettes must differ
      expect(darkTheme.colors.background).not.toBe(lightTheme.colors.background);
      expect(darkTheme.colors.surface).not.toBe(lightTheme.colors.surface);
      expect(darkTheme.colors.textPrimary).not.toBe(lightTheme.colors.textPrimary);
    });

    it('persists and reads theme preference in AsyncStorage', async () => {
      expect(await AsyncStorage.getItem('@cura_theme_mode')).toBeNull();

      await AsyncStorage.setItem('@cura_theme_mode', 'light');
      expect(await AsyncStorage.getItem('@cura_theme_mode')).toBe('light');

      await AsyncStorage.setItem('@cura_theme_mode', 'system');
      expect(await AsyncStorage.getItem('@cura_theme_mode')).toBe('system');
    });
  });

  describe('2. Notification Categories Independence (SPEC §11)', () => {
    it('provides all 6 categories enabled by default', async () => {
      const prefs = await getNotificationPreferences();
      expect(prefs.timedTaskReminders).toBe(true);
      expect(prefs.endOfDayReminders).toBe(true);
      expect(prefs.morningCheckin).toBe(true);
      expect(prefs.eveningCheckin).toBe(true);
      expect(prefs.accomplishments).toBe(true);
      expect(prefs.aiInsights).toBe(true);
      expect(prefs.quietHoursEnabled).toBe(false);
    });

    it('toggling one category leaves all other 5 categories unaffected', async () => {
      // Disable timedTaskReminders only
      const updated = await updateNotificationCategory('timedTaskReminders', false);
      expect(updated.timedTaskReminders).toBe(false);

      // Verify the other 5 are still true
      expect(updated.endOfDayReminders).toBe(true);
      expect(updated.morningCheckin).toBe(true);
      expect(updated.eveningCheckin).toBe(true);
      expect(updated.accomplishments).toBe(true);
      expect(updated.aiInsights).toBe(true);

      // Disable morningCheckin only
      const updated2 = await updateNotificationCategory('morningCheckin', false);
      expect(updated2.morningCheckin).toBe(false);
      expect(updated2.eveningCheckin).toBe(true);
      expect(updated2.timedTaskReminders).toBe(false);
      expect(updated2.accomplishments).toBe(true);
    });

    it('maintains backward compatibility with checkinScheduler legacy methods', async () => {
      const checkinPrefs = await getCheckinPreferences();
      expect(checkinPrefs.morningEnabled).toBe(true);
      expect(checkinPrefs.eveningEnabled).toBe(true);

      await saveCheckinPreferences({
        morningEnabled: false,
        eveningEnabled: true,
        morningTime: '08:30',
        eveningTime: '21:00',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      });

      const fullPrefs = await getNotificationPreferences();
      expect(fullPrefs.morningCheckin).toBe(false);
      expect(fullPrefs.eveningCheckin).toBe(true);
      expect(fullPrefs.morningTime).toBe('08:30');
      expect(fullPrefs.eveningTime).toBe('21:00');
    });

    it('evaluates quiet hours accurately across midnight and same-day spans', () => {
      // Overnight quiet hours: 22:00 to 08:00
      expect(isTimeInQuietHours('23:00', '22:00', '08:00', true)).toBe(true);
      expect(isTimeInQuietHours('02:30', '22:00', '08:00', true)).toBe(true);
      expect(isTimeInQuietHours('07:59', '22:00', '08:00', true)).toBe(true);
      expect(isTimeInQuietHours('08:01', '22:00', '08:00', true)).toBe(false);
      expect(isTimeInQuietHours('15:00', '22:00', '08:00', true)).toBe(false);

      // Disabled quiet hours: always false
      expect(isTimeInQuietHours('23:00', '22:00', '08:00', false)).toBe(false);

      // Same day quiet hours: 13:00 to 15:00
      expect(isTimeInQuietHours('14:00', '13:00', '15:00', true)).toBe(true);
      expect(isTimeInQuietHours('16:00', '13:00', '15:00', true)).toBe(false);
    });
  });

  describe('3. Task Notification Lifecycle', () => {
    it('cancels notification when task is completed or cancelled', async () => {
      const taskId = 'task_timed_1';
      const identifier = getTaskNotificationIdentifier(taskId);

      // Schedule a mock notification
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: 'Test Task' },
        trigger: null,
      });

      let scheduled = await Notifications.getAllScheduledNotificationsAsync();
      expect(scheduled.some((n: any) => n.identifier === identifier)).toBe(true);

      // Cancel reminder
      await cancelTaskReminder(taskId);

      scheduled = await Notifications.getAllScheduledNotificationsAsync();
      expect(scheduled.some((n: any) => n.identifier === identifier)).toBe(false);
    });

    it('scheduleTaskReminder cancels existing notification if task is marked completed', async () => {
      const task: any = {
        id: 'task_completed_1',
        title: 'Completed Task',
        status: 'completed',
        isTimed: true,
        dueDate: '2026-11-20',
        dueTime: '10:00',
      };

      const identifier = getTaskNotificationIdentifier(task.id);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: task.title },
        trigger: null,
      });

      const res = await scheduleTaskReminder(task);
      expect(res).toBe(false);

      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      expect(scheduled.some((n: any) => n.identifier === identifier)).toBe(false);
    });
  });

  describe('4. Data Export & Storage Stats', () => {
    const testUserId = 'usr_phase9';

    beforeEach(async () => {
      // Seed data
      await createTask(db, {
        userId: testUserId,
        title: 'Task with "quotes" and, commas',
        description: 'Multi-line\nnote',
      });
      await createTask(db, {
        userId: testUserId,
        title: 'Task 2',
      });

      await createMoodEntry(db, {
        userId: testUserId,
        moodType: 'happy',
        note: 'Great day with "friend", cool!',
      });

      const conv = await createConversation(db, {
        userId: testUserId,
        title: 'Chat 1',
      });
      await createMessage(db, {
        conversationId: conv.id,
        sender: 'user',
        content: 'Hello AI',
      });

      await getOrCreateCheckinOccurrence(db, {
        userId: testUserId,
        checkinType: 'morning',
        localDate: '2026-11-08',
      });
    });

    it('calculates storage stats accurately', async () => {
      const stats = await getDatabaseStorageStats(db, testUserId);
      expect(stats.tasksCount).toBe(2);
      expect(stats.moodsCount).toBe(1);
      // 1 user conversation + 1 auto-created checkin conversation
      expect(stats.conversationsCount).toBe(2);
      expect(stats.messagesCount).toBe(1);
      expect(stats.checkinsCount).toBe(1);
      expect(stats.estimatedDbSizeBytes).toBeGreaterThan(0);
    });

    it('exports complete user data as JSON format', async () => {
      const jsonStr = await exportUserDataJson(db, testUserId);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.exportVersion).toBe('1.0');
      expect(parsed.summary.tasksCount).toBe(2);
      expect(parsed.summary.moodEntriesCount).toBe(1);
      expect(parsed.summary.conversationsCount).toBe(2);
      expect(parsed.summary.checkinsCount).toBe(1);

      expect(parsed.data.tasks).toHaveLength(2);
      expect(parsed.data.moodEntries).toHaveLength(1);
      expect(parsed.data.conversations).toHaveLength(2);
      expect(parsed.data.messages).toHaveLength(1);
      expect(parsed.data.checkins).toHaveLength(1);
    });

    it('exports RFC 4180 escaped CSV format with separate sections', async () => {
      const csvStr = await exportUserDataCsv(db, testUserId);

      // Section markers
      expect(csvStr).toContain('=== TASKS ===');
      expect(csvStr).toContain('=== MOOD_ENTRIES ===');
      expect(csvStr).toContain('=== CONVERSATIONS ===');
      expect(csvStr).toContain('=== CHECKINS ===');

      // Escaping check: double-quoted fields with quotes inside escaped as ""
      expect(csvStr).toContain('"Task with ""quotes"" and, commas"');
      expect(csvStr).toContain('"Multi-line\nnote"');
      expect(csvStr).toContain('"Great day with ""friend"", cool!"');
    });

    it('performs vacuumDatabase cleanly', async () => {
      await expect(vacuumDatabase(db)).resolves.not.toThrow();
    });
  });

  describe('5. Delete My Data Flow (SPEC §16.2)', () => {
    const testUserId = 'usr_phase9';

    beforeEach(async () => {
      await createTask(db, { userId: testUserId, title: 'Task to delete' });
      await createMoodEntry(db, { userId: testUserId, moodType: 'stressed' });
      const conv = await createConversation(db, { userId: testUserId, title: 'Chat to delete' });
      await createMessage(db, { conversationId: conv.id, sender: 'user', content: 'Secret text' });
      await getOrCreateCheckinOccurrence(db, {
        userId: testUserId,
        checkinType: 'evening',
        localDate: '2026-11-08',
      });

      // Put tokens in secureStorage
      secureStorage.set('cura_access_token', 'token_123');
      secureStorage.set('cura_refresh_token', 'token_456');
    });

    it('purges all user data across SQLite tables, resets epoch to guest, and clears SecureStore tokens', async () => {
      const statsBefore = await getDatabaseStorageStats(db, testUserId);
      expect(statsBefore.tasksCount).toBe(1);
      expect(statsBefore.moodsCount).toBe(1);
      expect(secureStorage.size).toBeGreaterThan(0);

      const deleteRes = await deleteMyData(db, testUserId);
      expect(deleteRes.success).toBe(true);

      // Verify all tables zeroed out for testUserId
      const statsAfter = await getDatabaseStorageStats(db, testUserId);
      expect(statsAfter.tasksCount).toBe(0);
      expect(statsAfter.moodsCount).toBe(0);
      expect(statsAfter.conversationsCount).toBe(0);
      expect(statsAfter.messagesCount).toBe(0);
      expect(statsAfter.checkinsCount).toBe(0);

      // Verify tokens cleared
      expect(secureStorage.get('cura_access_token')).toBeUndefined();
      expect(secureStorage.get('cura_refresh_token')).toBeUndefined();

      // Verify widget metadata transitioned to guest
      const meta = (await db.getAllAsync(`SELECT * FROM widget_snapshot_metadata WHERE id = 1;`))[0] as any;
      expect(meta.user_id).toBe('guest');
      expect(meta.account_epoch).toBe(2);
      expect(meta.source_revision).toBe(meta.published_revision);
    });
  });

  describe('6. Crisis Support Directory (SPEC §16.5)', () => {
    it('provides Pakistan verified emergency & helpline directory by default', () => {
      const pkHelplines = getCrisisDirectory('PK');
      expect(pkHelplines.countryCode).toBe('PK');
      expect(pkHelplines.countryName).toBe('Pakistan');
      expect(pkHelplines.emergencyNumber).toBe('1122');

      const helplines = pkHelplines.helplines;
      const rescue1122 = helplines.find((s) => s.contact === '1122');
      const police15 = helplines.find((s) => s.contact === '15');
      const edhi115 = helplines.find((s) => s.contact === '115');
      const umang = helplines.find((s) => s.name.includes('Umang'));
      const rozan = helplines.find((s) => s.name.includes('Rozan'));

      expect(rescue1122).toBeDefined();
      expect(police15).toBeDefined();
      expect(edhi115).toBeDefined();
      expect(umang).toBeDefined();
      expect(umang?.contact).toBe('03117786264');
      expect(rozan).toBeDefined();
      expect(rozan?.contact).toBe('080022444');
    });

    it('provides valid fallbacks for US, GB, and International', () => {
      const us = getCrisisDirectory('US');
      expect(us.emergencyNumber).toBe('911');
      expect(us.helplines.some((s) => s.contact === '988')).toBe(true);

      const gb = getCrisisDirectory('GB');
      expect(gb.emergencyNumber).toBe('999');
      expect(gb.helplines.some((s) => s.contact === '116123')).toBe(true);

      const intl = getCrisisDirectory('INT');
      expect(intl.emergencyNumber).toBe('112');
      expect(intl.helplines.length).toBeGreaterThan(0);
    });

    it('contains required disclaimers and trusted person guidance', () => {
      expect(CRISIS_DISCLAIMER_TEXT).toContain('Cura is an AI');
      expect(CRISIS_DISCLAIMER_TEXT).toContain('emergency');
      expect(CRISIS_DISCLAIMER_TEXT).toContain('informational and supportive');

      expect(TRUSTED_PERSON_PROMPT).toContain('trusted');
    });
  });

  describe('7. Design System & Theme Token Adherence (Zero Hardcoded Hex)', () => {
    it('verifies all settings modals and profile tab have zero hardcoded hex colors', () => {
      const filesToCheck = [
        path.resolve(__dirname, '../../src/components/settings/NotificationSettingsModal.tsx'),
        path.resolve(__dirname, '../../src/components/settings/AISettingsModal.tsx'),
        path.resolve(__dirname, '../../src/components/settings/PrivacyPolicyModal.tsx'),
        path.resolve(__dirname, '../../src/components/settings/CrisisSupportModal.tsx'),
        path.resolve(__dirname, '../../src/components/settings/DataManagementModal.tsx'),
        path.resolve(__dirname, '../../app/(tabs)/profile.tsx'),
      ];

      const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;

      for (const filePath of filesToCheck) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(hexPattern);
        expect(matches ?? []).toEqual([]);
      }
    });
  });
});
