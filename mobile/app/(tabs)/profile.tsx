import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Avatar } from '../../src/components/ui/Avatar';
import { Button } from '../../src/components/ui/Button';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Divider } from '../../src/components/ui/Divider';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/services/auth';
import { ThemeMode } from '../../src/theme';

// Settings Modals
import { NotificationSettingsModal } from '../../src/components/settings/NotificationSettingsModal';
import { AISettingsModal } from '../../src/components/settings/AISettingsModal';
import { CrisisSupportModal } from '../../src/components/settings/CrisisSupportModal';
import { PrivacyPolicyModal } from '../../src/components/settings/PrivacyPolicyModal';
import { DataManagementModal } from '../../src/components/settings/DataManagementModal';

export default function ProfileScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { isGuest, email, userId, logout } = useAuth();
  const router = useRouter();

  // Modal display states
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showAISettings, setShowAISettings] = useState<boolean>(false);
  const [showCrisisSupport, setShowCrisisSupport] = useState<boolean>(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState<boolean>(false);
  const [showDataManagement, setShowDataManagement] = useState<boolean>(false);

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
          subtitle="Application foundation, preferences & data sovereignty"
        />
      }
    >
      {/* 1. Profile Presentation (Guest vs Authenticated) */}
      <Card variant="surface" style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Avatar name={isGuest ? 'Guest User' : (email || 'User')} size="lg" />
          <View style={styles.profileDetails}>
            <Text variant="heading3">{isGuest ? 'Guest Companion' : (email || 'Cura User')}</Text>
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: isGuest
                      ? theme.colors.surfaceSubtle
                      : theme.colors.successSubtle,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isGuest
                        ? theme.colors.textMuted
                        : theme.colors.success,
                    },
                  ]}
                />
                <Text
                  variant="caption"
                  color={isGuest ? theme.colors.textMuted : theme.colors.success}
                  weight="600"
                >
                  {isGuest ? 'Guest Mode Active' : 'Account Synced'}
                </Text>
              </View>
            </View>
            <Text variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
              {isGuest
                ? 'Local storage mode. Sign in to sync and back up your data.'
                : `User ID: ${userId.slice(0, 8)}...`}
            </Text>
          </View>
        </View>

        {isGuest ? (
          <View style={[styles.authButtonsRow, { borderTopColor: theme.colors.borderSubtle }]}>
            <Button
              title="Sign In"
              variant="primary"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => router.push('/(auth)/login' as any)}
            />
            <Button
              title="Create Account"
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => router.push('/(auth)/register' as any)}
            />
          </View>
        ) : (
          <View style={[styles.authButtonsRow, { borderTopColor: theme.colors.borderSubtle }]}>
            <Button
              title="Sign Out"
              variant="outline"
              size="sm"
              fullWidth
              onPress={() => logout()}
            />
          </View>
        )}
      </Card>

      {/* 2. Appearance Theme Selection (Functional & Persisted) */}
      <SectionHeader
        title="Appearance"
        subtitle="Theme switcher (Dark, Light, System) applied instantly"
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
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${opt.label} theme`}
                accessibilityState={{ selected: isSelected }}
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

      {/* 3. Settings & Controls */}
      <SectionHeader
        title="Preferences & Configuration"
        subtitle="Notification schedules, AI providers, and safety support"
      />
      <Card variant="surface" style={styles.settingsCard}>
        {/* Notification Preferences Row */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowNotifications(true)}
          accessibilityRole="button"
          accessibilityLabel="Notification Preferences"
          style={styles.menuRow}
        >
          <View style={[styles.menuIconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Ionicons name="notifications-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.menuTextCol}>
            <Text variant="body" weight="600">
              Notification Preferences
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Independent toggles for all 6 categories, quiet hours & local timezone
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <Divider />

        {/* AI Provider Settings Row */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowAISettings(true)}
          accessibilityRole="button"
          accessibilityLabel="AI Provider and Models"
          style={styles.menuRow}
        >
          <View style={[styles.menuIconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.menuTextCol}>
            <Text variant="body" weight="600">
              AI Provider & Models
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Selected chat provider, model choices, connection health & failover priority
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <Divider />

        {/* Crisis Support & Helplines Row */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowCrisisSupport(true)}
          accessibilityRole="button"
          accessibilityLabel="Support and Crisis Helplines"
          style={styles.menuRow}
        >
          <View style={[styles.menuIconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Ionicons name="heart-circle-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.menuTextCol}>
            <Text variant="body" weight="600">
              Support & Crisis Helplines
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Country-specific emergency numbers (Rescue 1122, Umang 24/7) & support directory
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </Card>

      {/* 4. Privacy & Data Sovereignty */}
      <SectionHeader
        title="Privacy & Data Sovereignty"
        subtitle="Complete ownership of your entries with open exports and deletion"
      />
      <Card variant="surface" style={styles.settingsCard}>
        {/* Privacy Policy / Explanations Row */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowPrivacyPolicy(true)}
          accessibilityRole="button"
          accessibilityLabel="Privacy and AI Data Explanations"
          style={styles.menuRow}
        >
          <View style={[styles.menuIconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Ionicons name="shield-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.menuTextCol}>
            <Text variant="body" weight="600">
              Privacy & AI Data Explanations
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Transparent accounting of local SQLite storage vs scoped AI prompt context
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <Divider />

        {/* Data Portability & Database Management Row */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowDataManagement(true)}
          accessibilityRole="button"
          accessibilityLabel="Data Portability and Storage"
          style={styles.menuRow}
        >
          <View style={[styles.menuIconPill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <Ionicons name="server-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.menuTextCol}>
            <Text variant="body" weight="600">
              Data Controls & Storage Management
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary}>
              Export JSON / CSV, vacuum database, and permanent data deletion
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </Card>

      {/* App Version Info */}
      <View style={styles.footer}>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Cura Personal Companion • SPEC Phase 9 Complete
        </Text>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Expo SDK 58 • React Native 0.88 • SQLite Local-First
        </Text>
      </View>

      {/* Interactive Modals */}
      <NotificationSettingsModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
      <AISettingsModal
        visible={showAISettings}
        onClose={() => setShowAISettings(false)}
      />
      <CrisisSupportModal
        visible={showCrisisSupport}
        onClose={() => setShowCrisisSupport(false)}
      />
      <PrivacyPolicyModal
        visible={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />
      <DataManagementModal
        visible={showDataManagement}
        onClose={() => setShowDataManagement(false)}
      />
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
  authButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
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
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  menuIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextCol: {
    flex: 1,
    marginRight: 10,
  },
  footer: {
    paddingVertical: 16,
    gap: 2,
  },
});
