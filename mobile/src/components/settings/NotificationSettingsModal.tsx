import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Switch, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { useTheme } from '../../hooks/useTheme';
import {
  getNotificationPreferences,
  updateNotificationCategory,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../../services/notificationPreferences';
import { getDatabase } from '../../db/client';
import { rescheduleAllTaskReminders, syncEndOfDayReminder } from '../../services/taskNotificationScheduler';

export interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationSettingsModal({ visible, onClose }: NotificationSettingsModalProps) {
  const { theme } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const [timeZone, setTimeZone] = useState<string>('Local');

  useEffect(() => {
    if (visible) {
      getNotificationPreferences().then(setPrefs);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setTimeZone(tz || 'Local');
      } catch {
        setTimeZone('Local');
      }

      // Check system notification permission
      Notifications.getPermissionsAsync()
        .then((status) => {
          setHasPermission(status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED);
        })
        .catch(() => setHasPermission(true));
    }
  }, [visible]);

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const updated = await updateNotificationCategory(key, value);
    setPrefs(updated);

    // Sync task schedules when relevant toggles change
    try {
      const db = await getDatabase();
      if (key === 'timedTaskReminders') {
        await rescheduleAllTaskReminders(db);
      } else if (key === 'endOfDayReminders') {
        await syncEndOfDayReminder(db);
      }
    } catch {
      // Safe fallback
    }
  };

  const categories: {
    key: keyof NotificationPreferences;
    title: string;
    description: string;
    icon: string;
  }[] = [
    {
      key: 'timedTaskReminders',
      title: 'Timed Task Reminders',
      description: 'Alerts at the scheduled due date and time for timed tasks',
      icon: 'alarm-outline',
    },
    {
      key: 'endOfDayReminders',
      title: 'End-of-Day Task Review',
      description: `Daily evening digest at ${prefs.endOfDayTime} for pending tasks`,
      icon: 'calendar-outline',
    },
    {
      key: 'morningCheckin',
      title: 'Morning AI Check-In',
      description: `Calm morning reflection prompt at ${prefs.morningTime}`,
      icon: 'sunny-outline',
    },
    {
      key: 'eveningCheckin',
      title: 'Evening AI Check-In',
      description: `Reflective evening wind-down prompt at ${prefs.eveningTime}`,
      icon: 'moon-outline',
    },
    {
      key: 'accomplishments',
      title: 'Accomplishment Highlights',
      description: 'Celebrates completed daily tasks and goal achievements',
      icon: 'sparkles-outline',
    },
    {
      key: 'aiInsights',
      title: 'AI Insight Notifications',
      description: 'Periodic patterns and wellbeing observations from your entries',
      icon: 'bulb-outline',
    },
  ];

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Notification Preferences"
      subtitle="Configure independent delivery for all 6 notification types"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Permission warning banner if denied */}
        {!hasPermission && (
          <Card variant="surface" style={[styles.warningCard, { borderColor: theme.colors.warning }]}>
            <View style={styles.warningRow}>
              <Ionicons name="warning-outline" size={22} color={theme.colors.warning} />
              <View style={styles.warningTextCol}>
                <Text variant="bodySmall" weight="600" color={theme.colors.warning}>
                  System Notifications Disabled
                </Text>
                <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                  Your device settings are currently blocking notifications for Cura. Enable notifications to receive
                  timely reminders.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'ios') Linking.openURL('app-settings:');
                    else Linking.openSettings();
                  }}
                  style={styles.openSettingsButton}
                >
                  <Text variant="caption" weight="600" color={theme.colors.accent}>
                    Open Device Settings →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}

        {/* Timezone & Quiet Hours Notice */}
        <View style={[styles.infoBanner, { backgroundColor: theme.colors.surfaceElevated }]}>
          <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
          <Text variant="caption" color={theme.colors.textMuted} style={{ marginLeft: 6 }}>
            Operating in timezone: <Text variant="caption" weight="600" color={theme.colors.textPrimary}>{timeZone}</Text>
          </Text>
        </View>

        {/* 6 Individual Category Toggles */}
        <Card variant="surface" style={styles.togglesCard}>
          {categories.map((cat, idx) => {
            const isEnabled = Boolean(prefs[cat.key]);
            return (
              <React.Fragment key={cat.key}>
                <View style={styles.toggleRow}>
                  <View style={[styles.iconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
                    <Ionicons name={cat.icon as any} size={18} color={theme.colors.accent} />
                  </View>
                  <View style={styles.toggleTextCol}>
                    <Text variant="body" weight="600">
                      {cat.title}
                    </Text>
                    <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                      {cat.description}
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(val) => handleToggle(cat.key, val)}
                    trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.accent }}
                    thumbColor={theme.colors.accentForeground}
                  />
                </View>
                {idx < categories.length - 1 && <Divider style={{ marginVertical: 10 }} />}
              </React.Fragment>
            );
          })}
        </Card>

        {/* Quiet Hours Configuration */}
        <Card variant="surface" style={styles.quietHoursCard}>
          <View style={styles.toggleRow}>
            <View style={[styles.iconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
              <Ionicons name="bed-outline" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.toggleTextCol}>
              <Text variant="body" weight="600">
                Quiet Hours
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                {prefs.quietHoursEnabled
                  ? `Suppresses all notifications between ${prefs.quietHoursStart} and ${prefs.quietHoursEnd}`
                  : 'Allows notifications during standard evening and morning periods'}
              </Text>
            </View>
            <Switch
              value={prefs.quietHoursEnabled}
              onValueChange={(val) => handleToggle('quietHoursEnabled', val)}
              trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.accent }}
              thumbColor={theme.colors.accentForeground}
            />
          </View>
        </Card>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  warningCard: {
    marginBottom: 14,
    borderWidth: 1,
    padding: 12,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  openSettingsButton: {
    marginTop: 6,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
  },
  togglesCard: {
    marginBottom: 14,
    padding: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toggleTextCol: {
    flex: 1,
    marginRight: 10,
  },
  quietHoursCard: {
    padding: 14,
    marginBottom: 14,
  },
});
