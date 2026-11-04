import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Avatar } from '../../src/components/ui/Avatar';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Divider } from '../../src/components/ui/Divider';
import { useTheme } from '../../src/hooks/useTheme';
import { ThemeMode } from '../../src/theme';

export default function ProfileScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();

  const themeOptions: { id: ThemeMode; label: string; icon: string }[] = [
    { id: 'dark', label: 'Dark', icon: 'moon' },
    { id: 'light', label: 'Light', icon: 'sunny' },
    { id: 'system', label: 'System', icon: 'phone-portrait-outline' },
  ];

  return (
    <ScreenContainer
      header={
        <Header
          title="Profile & Settings"
          subtitle="Application foundation & preferences"
        />
      }
    >
      {/* Basic Guest Profile Presentation */}
      <Card variant="surface" style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Avatar name="Guest User" size="lg" />
          <View style={styles.profileDetails}>
            <Text variant="heading3">Guest Companion</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.statusBadge, { backgroundColor: theme.colors.successSubtle }]}>
                <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                <Text variant="caption" color={theme.colors.success} weight="600">
                  Guest Mode Active
                </Text>
              </View>
            </View>
            <Text variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
              Local storage mode. Cloud accounts will be introduced in Phase 2.
            </Text>
          </View>
        </View>
      </Card>

      {/* Centralized Appearance Selection (Functional) */}
      <SectionHeader
        title="Appearance"
        subtitle="Centralized theme switcher (Functional in Phase 1)"
      />
      <Card variant="surface" style={styles.settingsCard}>
        <View style={styles.themeSelectorRow}>
          {themeOptions.map((opt) => {
            const isSelected = themeMode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.7}
                onPress={() => setThemeMode(opt.id)}
                style={[
                  styles.themeOptionPill,
                  {
                    backgroundColor: isSelected ? theme.colors.accent : theme.colors.surfaceElevated,
                    borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
                  },
                ]}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={16}
                  color={isSelected ? theme.colors.accentForeground : theme.colors.textSecondary}
                />
                <Text
                  variant="caption"
                  color={isSelected ? theme.colors.accentForeground : theme.colors.textSecondary}
                  weight={isSelected ? '600' : '500'}
                  style={styles.themeOptionText}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Settings Layout Previews (Non-functional demonstration) */}
      <SectionHeader
        title="Settings & Privacy Preview"
        subtitle="Static preview of future configuration screens"
      />
      <Card variant="surface" style={styles.previewCard}>
        <View style={styles.previewRow}>
          <View style={styles.previewTextCol}>
            <Text variant="body" weight="600">
              Notification Preferences
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Granular toggles for tasks, check-ins, and reminders (Phase 9)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>

        <Divider />

        <View style={styles.previewRow}>
          <View style={styles.previewTextCol}>
            <Text variant="body" weight="600">
              Country & Safety Support
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Country selection and crisis helpline directories (Phase 9)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>

        <Divider />

        <View style={styles.previewRow}>
          <View style={styles.previewTextCol}>
            <Text variant="body" weight="600">
              Data Portability & Export
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Local JSON/CSV export and database management (Phase 9)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>
      </Card>

      {/* Scope Disclaimer */}
      <View style={[styles.noteBox, { backgroundColor: theme.colors.surfaceSubtle }]}>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Phase 1 layout preview. Authentication, cloud sync, helpline directories, and data export belong to future phases.
        </Text>
      </View>

      {/* App Version Info */}
      <View style={styles.footer}>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Cura Personal Companion • Foundation v1.0.0
        </Text>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Expo SDK 58 • React Native 0.88 • New Architecture
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    marginBottom: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileDetails: {
    marginLeft: 14,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  settingsCard: {
    marginBottom: 20,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOptionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeOptionText: {
    marginLeft: 6,
  },
  previewCard: {
    marginBottom: 20,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  previewTextCol: {
    flex: 1,
    marginRight: 12,
  },
  noteBox: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
  },
  footer: {
    paddingVertical: 12,
    gap: 2,
  },
});
