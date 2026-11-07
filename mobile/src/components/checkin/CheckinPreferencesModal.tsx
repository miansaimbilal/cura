import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Switch, ScrollView } from 'react-native';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Divider';
import { useTheme } from '../../hooks/useTheme';
import { CheckinPreferences } from '../../types/checkin';
import {
  getCheckinPreferences,
  saveCheckinPreferences,
  DEFAULT_CHECKIN_PREFERENCES,
  isValidTimeString,
} from '../../services/notificationPreferences';
import { reconcileCheckinNotifications } from '../../services/checkinScheduler';

interface CheckinPreferencesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CheckinPreferencesModal({
  visible,
  onClose,
}: CheckinPreferencesModalProps) {
  const { theme } = useTheme();

  const [prefs, setPrefs] = useState<CheckinPreferences>(DEFAULT_CHECKIN_PREFERENCES);
  const [morningTime, setMorningTime] = useState(DEFAULT_CHECKIN_PREFERENCES.morningTime);
  const [eveningTime, setEveningTime] = useState(DEFAULT_CHECKIN_PREFERENCES.eveningTime);
  const [quietStart, setQuietStart] = useState(DEFAULT_CHECKIN_PREFERENCES.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState(DEFAULT_CHECKIN_PREFERENCES.quietHoursEnd);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (visible) {
      getCheckinPreferences().then((loaded) => {
        if (!isMounted) return;
        setPrefs(loaded);
        setMorningTime(loaded.morningTime);
        setEveningTime(loaded.eveningTime);
        setQuietStart(loaded.quietHoursStart);
        setQuietEnd(loaded.quietHoursEnd);
        setErrorMsg(null);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [visible]);

  const handleSave = async () => {
    setErrorMsg(null);

    if (prefs.morningEnabled && !isValidTimeString(morningTime)) {
      setErrorMsg('Morning check-in time must be in 24h format (e.g., 08:30).');
      return;
    }
    if (prefs.eveningEnabled && !isValidTimeString(eveningTime)) {
      setErrorMsg('Evening reflection time must be in 24h format (e.g., 20:30).');
      return;
    }
    if (prefs.quietHoursEnabled) {
      if (!isValidTimeString(quietStart) || !isValidTimeString(quietEnd)) {
        setErrorMsg('Quiet hours start and end must be in 24h format (e.g., 22:00 and 07:00).');
        return;
      }
    }

    const updated: CheckinPreferences = {
      morningEnabled: prefs.morningEnabled,
      morningTime: isValidTimeString(morningTime) ? morningTime : prefs.morningTime,
      eveningEnabled: prefs.eveningEnabled,
      eveningTime: isValidTimeString(eveningTime) ? eveningTime : prefs.eveningTime,
      quietHoursEnabled: prefs.quietHoursEnabled,
      quietHoursStart: isValidTimeString(quietStart) ? quietStart : prefs.quietHoursStart,
      quietHoursEnd: isValidTimeString(quietEnd) ? quietEnd : prefs.quietHoursEnd,
    };

    setIsSaving(true);
    try {
      await saveCheckinPreferences(updated);
      await reconcileCheckinNotifications(updated);
      onClose();
    } catch (err) {
      console.warn('Failed to save preferences', err);
      setErrorMsg('Failed to save preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Check-in Preferences"
      subtitle="Customize when Cura prompts your daily reflections"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        {errorMsg && (
          <View style={[styles.errorBox, { backgroundColor: theme.colors.errorSubtle }]}>
            <Text variant="caption" color={theme.colors.error}>
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Morning Check-in Section */}
        <View style={styles.sectionRow}>
          <View style={styles.textColumn}>
            <Text variant="body" weight="600" color={theme.colors.textPrimary}>
              Morning Check-in
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Start the day with calm clarity and intention
            </Text>
          </View>
          <Switch
            value={prefs.morningEnabled}
            onValueChange={(val) => setPrefs((p) => ({ ...p, morningEnabled: val }))}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.accent }}
            thumbColor={theme.colors.surface}
          />
        </View>
        {prefs.morningEnabled && (
          <View style={styles.timeInputRow}>
            <Text variant="caption" color={theme.colors.textMuted} style={styles.timeLabel}>
              Time (24h):
            </Text>
            <Input
              value={morningTime}
              onChangeText={setMorningTime}
              placeholder="08:30"
              style={styles.timeInput}
            />
          </View>
        )}

        <Divider style={styles.divider} />

        {/* Evening Reflection Section */}
        <View style={styles.sectionRow}>
          <View style={styles.textColumn}>
            <Text variant="body" weight="600" color={theme.colors.textPrimary}>
              Evening Reflection
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Unwind, review today&apos;s pace, and reflect
            </Text>
          </View>
          <Switch
            value={prefs.eveningEnabled}
            onValueChange={(val) => setPrefs((p) => ({ ...p, eveningEnabled: val }))}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.accent }}
            thumbColor={theme.colors.surface}
          />
        </View>
        {prefs.eveningEnabled && (
          <View style={styles.timeInputRow}>
            <Text variant="caption" color={theme.colors.textMuted} style={styles.timeLabel}>
              Time (24h):
            </Text>
            <Input
              value={eveningTime}
              onChangeText={setEveningTime}
              placeholder="20:30"
              style={styles.timeInput}
            />
          </View>
        )}

        <Divider style={styles.divider} />

        {/* Quiet Hours Section */}
        <View style={styles.sectionRow}>
          <View style={styles.textColumn}>
            <Text variant="body" weight="600" color={theme.colors.textPrimary}>
              Quiet Hours
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Protect your focus and sleep window
            </Text>
          </View>
          <Switch
            value={prefs.quietHoursEnabled}
            onValueChange={(val) => setPrefs((p) => ({ ...p, quietHoursEnabled: val }))}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.accent }}
            thumbColor={theme.colors.surface}
          />
        </View>

        {prefs.quietHoursEnabled && (
          <View style={styles.quietHoursContainer}>
            <View style={styles.timeInputRow}>
              <Text variant="caption" color={theme.colors.textMuted} style={styles.timeLabel}>
                Start:
              </Text>
              <Input
                value={quietStart}
                onChangeText={setQuietStart}
                placeholder="22:00"
                style={styles.timeInput}
              />
              <Text variant="caption" color={theme.colors.textMuted} style={[styles.timeLabel, { marginLeft: 16 }]}>
                End:
              </Text>
              <Input
                value={quietEnd}
                onChangeText={setQuietEnd}
                placeholder="07:00"
                style={styles.timeInput}
              />
            </View>

            {/* Strict explanation copy required by specification */}
            <View style={[styles.noticeBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="caption" color={theme.colors.textMuted} style={{ lineHeight: 18 }}>
                Notifications scheduled during quiet hours will be skipped, not delayed or silenced.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.actionRow}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            style={{ flex: 1, marginRight: 8 }}
          />
          <Button
            title={isSaving ? 'Saving...' : 'Save Preferences'}
            variant="primary"
            onPress={handleSave}
            disabled={isSaving}
            style={{ flex: 1, marginLeft: 8 }}
          />
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  textColumn: {
    flex: 1,
    paddingRight: 16,
  },
  timeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeLabel: {
    marginRight: 8,
  },
  timeInput: {
    width: 90,
  },
  divider: {
    marginVertical: 12,
  },
  quietHoursContainer: {
    marginTop: 4,
  },
  noticeBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
});
