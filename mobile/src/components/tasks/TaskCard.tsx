import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { useTheme } from '../../hooks/useTheme';
import { Task } from '../../types/task';
import { formatDisplayDate, formatDisplayTime, isTaskOverdue } from '../../utils/date';

export interface TaskCardProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onPress: (task: Task) => void;
  showDate?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onToggleComplete,
  onPress,
  showDate = false,
}) => {
  const { theme } = useTheme();

  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';
  const isPostponed = task.status === 'postponed';
  const overdue = !isCompleted && !isCancelled && isTaskOverdue(task.dueDate, task.dueTime);

  // Badge configuration based on status and time
  const getBadgeConfig = () => {
    if (isCompleted) {
      return {
        label: 'Completed',
        icon: 'checkmark-done' as const,
        color: theme.colors.success,
        bg: theme.colors.successSubtle,
      };
    }
    if (isCancelled) {
      return {
        label: 'Cancelled',
        icon: 'close-circle-outline' as const,
        color: theme.colors.textMuted,
        bg: theme.colors.surfaceSubtle,
      };
    }
    if (isPostponed) {
      return {
        label: `Postponed • ${formatDisplayDate(task.dueDate)}`,
        icon: 'calendar-outline' as const,
        color: theme.colors.warning,
        bg: theme.colors.warningSubtle,
      };
    }
    if (overdue) {
      return {
        label: task.isTimed && task.dueTime
          ? `Overdue • ${formatDisplayTime(task.dueTime)}`
          : `Overdue • ${formatDisplayDate(task.dueDate)}`,
        icon: 'alert-circle-outline' as const,
        color: theme.colors.error,
        bg: theme.colors.errorSubtle,
      };
    }
    if (task.isTimed && task.dueTime) {
      return {
        label: showDate && task.dueDate
          ? `${formatDisplayDate(task.dueDate)} • ${formatDisplayTime(task.dueTime)}`
          : formatDisplayTime(task.dueTime),
        icon: 'time-outline' as const,
        color: theme.colors.accent,
        bg: theme.colors.accentSubtle,
      };
    }
    return {
      label: showDate && task.dueDate ? formatDisplayDate(task.dueDate) : 'End of Day',
      icon: 'sunny-outline' as const,
      color: theme.colors.warning,
      bg: theme.colors.warningSubtle,
    };
  };

  const badge = getBadgeConfig();

  return (
    <Card
      variant="surface"
      style={[
        styles.card,
        (isCompleted || isCancelled) && { opacity: 0.72 },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress(task)}
        style={styles.cardInner}
      >
        {/* Header row with badge and details button */}
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Ionicons name={badge.icon} size={13} color={badge.color} />
            <Text variant="caption" color={badge.color} weight="600" style={styles.badgeText}>
              {badge.label}
            </Text>
          </View>

          <TouchableOpacity
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => onPress(task)}
            accessibilityLabel="View task options"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content row with checkbox and task title/description */}
        <View style={styles.contentRow}>
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onToggleComplete(task.id)}
            style={[
              styles.checkbox,
              {
                borderColor: isCompleted
                  ? theme.colors.success
                  : overdue
                  ? theme.colors.error
                  : theme.colors.borderStrong,
                backgroundColor: isCompleted ? theme.colors.success : 'transparent',
              },
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isCompleted }}
            accessibilityLabel={`Mark "${task.title}" as ${isCompleted ? 'incomplete' : 'complete'}`}
          >
            {isCompleted && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
          </TouchableOpacity>

          <View style={styles.textContainer}>
            <Text
              variant="bodyLarge"
              weight="600"
              color={
                isCompleted || isCancelled
                  ? theme.colors.textMuted
                  : theme.colors.textPrimary
              }
              style={[
                isCompleted && styles.strikethrough,
                isCancelled && styles.strikethrough,
              ]}
              numberOfLines={2}
            >
              {task.title}
            </Text>

            {task.description ? (
              <Text
                variant="bodySmall"
                color={theme.colors.textSecondary}
                numberOfLines={2}
                style={styles.description}
              >
                {task.description}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    padding: 14,
  },
  cardInner: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  description: {
    marginTop: 4,
  },
});
