import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Avatar } from '../../src/components/ui/Avatar';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { ModalSheet } from '../../src/components/ui/ModalSheet';
import { useTheme } from '../../src/hooks/useTheme';
import { MOODS } from '../../src/constants';

export default function HomeScreen() {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const router = useRouter();
  const [selectedMoodPreview, setSelectedMoodPreview] = useState<string>('calm');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const toggleTheme = () => {
    const nextMode = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
    setThemeMode(nextMode);
  };

  const sampleDate = 'Wednesday, Nov 4';

  return (
    <ScreenContainer>
      {/* Top Welcome Bar */}
      <View style={styles.topBar}>
        <View style={styles.userSection}>
          <Avatar name="Guest User" size="md" />
          <View style={styles.nameColumn}>
            <Text variant="caption" color={theme.colors.textMuted}>
              {sampleDate} (Sample Date)
            </Text>
            <Text variant="heading2">Good day, Friend</Text>
          </View>
        </View>

        {/* Centralized Theme Switcher Button */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={toggleTheme}
          style={[
            styles.themePill,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
            },
          ]}
          accessibilityLabel={`Current theme is ${themeMode}. Tap to change.`}
        >
          <Ionicons
            name={isDark ? 'moon' : 'sunny'}
            size={16}
            color={theme.colors.accent}
          />
          <Text variant="caption" color={theme.colors.textSecondary} style={styles.themeText}>
            {themeMode.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* AI Companion Static Preview Card */}
      <Card variant="surface" style={[styles.companionCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.companionHeader}>
          <View style={[styles.companionIconBox, { backgroundColor: theme.colors.accentSubtle }]}>
            <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.companionHeaderText}>
            <Text variant="subheading" color={theme.colors.accent}>
              Cura Reflection Preview
            </Text>
            <Text variant="caption" color={theme.colors.textMuted}>
              Static Design Sample (Phase 6 Feature)
            </Text>
          </View>
        </View>
        <Text variant="body" style={styles.companionQuote}>
          {'"Take a deep breath. Today is a fresh opportunity to move at your own pace without pressure."'}
        </Text>
        <Button
          title="Component Modal Demo"
          variant="secondary"
          size="sm"
          onPress={() => setIsModalOpen(true)}
          style={styles.checkinButton}
        />
      </Card>

      {/* Mood Spectrum Design Preview */}
      <SectionHeader
        title="Mood Spectrum"
        subtitle="Visual design preview of non-judgmental mood tokens"
      />
      <View style={styles.moodRow}>
        {MOODS.slice(0, 5).map((m) => {
          const isSelected = selectedMoodPreview === m.id;
          const moodColor = theme.colors.moods[m.colorKey];
          return (
            <TouchableOpacity
              key={m.id}
              activeOpacity={0.75}
              onPress={() => setSelectedMoodPreview(m.id)}
              style={[
                styles.moodPill,
                {
                  backgroundColor: isSelected ? theme.colors.surfaceElevated : theme.colors.surface,
                  borderColor: isSelected ? moodColor : theme.colors.borderSubtle,
                  borderWidth: isSelected ? 1.5 : 1,
                },
              ]}
            >
              <Ionicons
                name={m.icon as any}
                size={20}
                color={isSelected ? moodColor : theme.colors.textMuted}
              />
              <Text
                variant="caption"
                color={isSelected ? theme.colors.textPrimary : theme.colors.textSecondary}
                style={styles.moodLabel}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Today's Tasks Summary Card (Static Sample Data) */}
      <SectionHeader
        title="Today's Focus (Sample Data)"
        actionText="View tasks"
        onActionPress={() => router.push('/(tabs)/tasks')}
      />
      <Card variant="surface" style={styles.taskCard}>
        <View style={styles.taskCardRow}>
          <View style={[styles.progressRingPlaceholder, { borderColor: theme.colors.accent }]}>
            <Text variant="subheading" color={theme.colors.accent} weight="700">
              60%
            </Text>
          </View>
          <View style={styles.taskStatsColumn}>
            <Text variant="heading3">Sample Progress (3 of 5)</Text>
            <Text variant="bodySmall" color={theme.colors.textSecondary}>
              Static layout preview for Phase 1
            </Text>
          </View>
        </View>

        {/* Task Item Sample Previews */}
        <View style={[styles.previewTaskItem, { borderTopColor: theme.colors.borderSubtle }]}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
          <Text variant="body" style={styles.previewTaskText}>
            Sample completed task item
          </Text>
          <Text variant="caption" color={theme.colors.textMuted}>
            Sample
          </Text>
        </View>

        <View style={[styles.previewTaskItem, { borderTopColor: theme.colors.borderSubtle }]}>
          <Ionicons name="ellipse-outline" size={20} color={theme.colors.textMuted} />
          <Text variant="body" style={styles.previewTaskText}>
            Sample pending timed task item
          </Text>
          <Text variant="caption" color={theme.colors.accent}>
            2:00 PM
          </Text>
        </View>
      </Card>

      {/* Scope Disclaimer Banner */}
      <View style={[styles.foundationNotice, { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.borderSubtle }]}>
        <Ionicons name="information-circle-outline" size={18} color={theme.colors.info} />
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.noticeText}>
          Phase 1 Foundation: Visual demonstration only. Actual task management, mood tracking, and AI features belong to future phases.
        </Text>
      </View>

      {/* Component Foundation Demo Modal */}
      <ModalSheet
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Modal Foundation Demo"
        subtitle="Reusable Bottom Sheet Component"
      >
        <Text variant="body" color={theme.colors.textSecondary} style={{ marginBottom: 16 }}>
          This bottom sheet demonstrates the reusable `ModalSheet` component with smooth animations and theme-aware styling. No persistent actions are executed.
        </Text>
        <Button
          title="Close Preview"
          variant="primary"
          onPress={() => setIsModalOpen(false)}
        />
      </ModalSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nameColumn: {
    marginLeft: 12,
  },
  themePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeText: {
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 11,
  },
  companionCard: {
    marginBottom: 20,
  },
  companionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  companionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  companionHeaderText: {
    flex: 1,
  },
  companionQuote: {
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: 12,
  },
  checkinButton: {
    alignSelf: 'flex-start',
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  moodPill: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    width: '18%',
  },
  moodLabel: {
    marginTop: 4,
    fontSize: 11,
  },
  taskCard: {
    marginBottom: 20,
  },
  taskCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressRingPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  taskStatsColumn: {
    flex: 1,
  },
  previewTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  previewTaskText: {
    flex: 1,
    marginLeft: 10,
  },
  foundationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  noticeText: {
    flex: 1,
    marginLeft: 8,
  },
});
