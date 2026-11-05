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
import { useTasks } from '../../src/hooks/useTasks';
import { useMood } from '../../src/hooks/useMood';
import { MOODS } from '../../src/constants';
import { MoodType, CreateMoodInput } from '../../src/types/mood';
import { TaskFormModal } from '../../src/components/tasks/TaskFormModal';
import { MoodLogModal } from '../../src/components/mood/MoodLogModal';
import { TaskProgressRing } from '../../src/components/charts/TaskProgressRing';
import { formatDisplayTime } from '../../src/utils/date';
import { CreateTaskInput } from '../../src/types/task';

export default function HomeScreen() {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const router = useRouter();
  const { filteredTasks, todaySummary, toggleComplete, createTask } = useTasks();
  const { latestMood, createMood } = useMood();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isMoodModalOpen, setIsMoodModalOpen] = useState(false);
  const [moodModalPreset, setMoodModalPreset] = useState<MoodType>('calm');

  const toggleTheme = () => {
    const nextMode = themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'system' : 'dark';
    setThemeMode(nextMode);
  };

  const currentDateFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const completionPercentage =
    todaySummary.total > 0
      ? Math.round((todaySummary.completed / todaySummary.total) * 100)
      : 0;

  // Show up to 3 tasks scheduled for today
  const todayTasksPreview = filteredTasks.slice(0, 3);

  const handleCreateTask = async (data: any) => {
    await createTask(data as CreateTaskInput);
  };

  return (
    <ScreenContainer>
      {/* Top Welcome Bar */}
      <View style={styles.topBar}>
        <View style={styles.userSection}>
          <Avatar name="Guest User" size="md" />
          <View style={styles.nameColumn}>
            <Text variant="caption" color={theme.colors.textMuted}>
              {currentDateFormatted}
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
              Design Preview (Phase 6 Feature)
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

      {/* Mood Overview Section (SPEC 5.1 & Phase 4 Integration) */}
      <SectionHeader
        title="Mood Overview"
        subtitle={latestMood ? `Latest feeling: ${MOODS.find(m => m.id === latestMood.moodType)?.label || latestMood.moodType}` : 'Quick mood check-in'}
        actionText="Open Tracker"
        onActionPress={() => router.push('/(tabs)/mood')}
      />
      <View style={styles.moodRow}>
        {MOODS.slice(0, 5).map((m) => {
          const isLatest = latestMood?.moodType === m.id;
          const moodColor = theme.colors.moods[m.colorKey];
          return (
            <TouchableOpacity
              key={m.id}
              activeOpacity={0.75}
              onPress={() => {
                setMoodModalPreset(m.id as MoodType);
                setIsMoodModalOpen(true);
              }}
              style={[
                styles.moodPill,
                {
                  backgroundColor: isLatest ? theme.colors.surfaceElevated : theme.colors.surface,
                  borderColor: isLatest ? moodColor : theme.colors.borderSubtle,
                  borderWidth: isLatest ? 1.5 : 1,
                },
              ]}
            >
              <Ionicons
                name={m.icon as any}
                size={20}
                color={isLatest ? moodColor : theme.colors.textMuted}
              />
              <Text
                variant="caption"
                color={isLatest ? theme.colors.textPrimary : theme.colors.textSecondary}
                style={styles.moodLabel}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Today's Tasks Summary Card (Connected to Local SQLite Data & Progress Ring) */}
      <SectionHeader
        title="Today's Focus"
        actionText="View all"
        onActionPress={() => router.push('/(tabs)/tasks')}
      />
      <Card variant="surface" style={styles.taskCard}>
        <View style={styles.taskCardRow}>
          <TaskProgressRing
            total={todaySummary.total}
            completed={todaySummary.completed}
            percentage={todaySummary.total > 0 ? completionPercentage : null}
            size={68}
            strokeWidth={7}
            showDetails={false}
          />
          <View style={styles.taskStatsColumn}>
            <Text variant="heading3">
              {todaySummary.total > 0
                ? `${todaySummary.completed} of ${todaySummary.total} completed`
                : 'No tasks scheduled'}
            </Text>
            <Text variant="bodySmall" color={theme.colors.textSecondary}>
              {todaySummary.overdue > 0
                ? `${todaySummary.overdue} overdue task${todaySummary.overdue > 1 ? 's' : ''}`
                : todaySummary.total > 0
                ? `${todaySummary.remaining} task${todaySummary.remaining === 1 ? '' : 's'} remaining`
                : 'Enjoy your day or add a new task'}
            </Text>
          </View>
        </View>

        {/* Task Items Preview */}
        {todayTasksPreview.length > 0 ? (
          todayTasksPreview.map((task) => {
            const isCompleted = task.status === 'completed';
            return (
              <TouchableOpacity
                key={task.id}
                activeOpacity={0.7}
                onPress={() => toggleComplete(task.id)}
                style={[styles.previewTaskItem, { borderTopColor: theme.colors.borderSubtle }]}
              >
                <Ionicons
                  name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={isCompleted ? theme.colors.success : theme.colors.textMuted}
                />
                <Text
                  variant="body"
                  color={isCompleted ? theme.colors.textMuted : theme.colors.textPrimary}
                  style={[
                    styles.previewTaskText,
                    isCompleted && { textDecorationLine: 'line-through' },
                  ]}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
                {task.isTimed && task.dueTime ? (
                  <Text variant="caption" color={theme.colors.accent}>
                    {formatDisplayTime(task.dueTime)}
                  </Text>
                ) : (
                  <Text variant="caption" color={theme.colors.textMuted}>
                    End of Day
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={[styles.emptyPreviewRow, { borderTopColor: theme.colors.borderSubtle }]}>
            <Button
              title="Add a Task for Today"
              size="sm"
              variant="outline"
              leftIcon={<Ionicons name="add" size={16} color={theme.colors.accent} />}
              onPress={() => setIsTaskFormOpen(true)}
              style={styles.addTodayBtn}
            />
          </View>
        )}
      </Card>

      {/* Component Foundation Demo Modal */}
      <ModalSheet
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Modal Foundation Demo"
        subtitle="Reusable Bottom Sheet Component"
      >
        <Text variant="body" color={theme.colors.textSecondary} style={{ marginBottom: 16 }}>
          This bottom sheet demonstrates the reusable `ModalSheet` component with smooth animations and theme-aware styling.
        </Text>
        <Button
          title="Close Preview"
          variant="primary"
          onPress={() => setIsModalOpen(false)}
        />
      </ModalSheet>

      {/* Quick Task Creation Modal from Home */}
      <TaskFormModal
        visible={isTaskFormOpen}
        onClose={() => setIsTaskFormOpen(false)}
        onSave={handleCreateTask}
      />

      {/* Quick Mood Log Modal from Home */}
      <MoodLogModal
        visible={isMoodModalOpen}
        onClose={() => setIsMoodModalOpen(false)}
        onSave={async (d) => {
          await createMood(d as CreateMoodInput);
        }}
        initialMood={moodModalPreset}
      />
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
  emptyPreviewRow: {
    paddingTop: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  addTodayBtn: {
    width: '100%',
  },
});
