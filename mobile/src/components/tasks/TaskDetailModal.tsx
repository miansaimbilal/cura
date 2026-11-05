import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { useTheme } from '../../hooks/useTheme';
import { Task } from '../../types/task';
import {
  formatDisplayDate,
  formatDisplayTime,
  getTomorrowDateString,
  getLocalDateString,
} from '../../utils/date';

export interface TaskDetailModalProps {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onToggleComplete: (id: string) => Promise<void>;
  onPostpone: (id: string, newDate: string, newTime?: string | null) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  visible,
  onClose,
  onEdit,
  onToggleComplete,
  onPostpone,
  onCancel,
  onDelete,
}) => {
  const { theme } = useTheme();
  const [showPostponeOptions, setShowPostponeOptions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!task) return null;

  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';

  const handleToggle = async () => {
    await onToggleComplete(task.id);
    onClose();
  };

  const handlePostponeTomorrow = async () => {
    const tomorrow = getTomorrowDateString();
    await onPostpone(task.id, tomorrow, task.dueTime);
    setShowPostponeOptions(false);
    onClose();
  };

  const handlePostponeNextWeek = async () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    await onPostpone(task.id, getLocalDateString(nextWeek), task.dueTime);
    setShowPostponeOptions(false);
    onClose();
  };

  const handleCancelTask = async () => {
    await onCancel(task.id);
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await onDelete(task.id);
              onClose();
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={() => {
        setShowPostponeOptions(false);
        onClose();
      }}
      title="Task Details"
    >
      <View style={styles.container}>
        {/* Status and Title Card */}
        <Card variant="surface" style={styles.detailCard}>
          <View style={styles.titleRow}>
            <Text
              variant="heading3"
              weight="700"
              color={
                isCompleted || isCancelled
                  ? theme.colors.textMuted
                  : theme.colors.textPrimary
              }
              style={[
                isCompleted && styles.strikethrough,
                isCancelled && styles.strikethrough,
                styles.titleText,
              ]}
            >
              {task.title}
            </Text>
          </View>

          {task.description ? (
            <Text
              variant="body"
              color={theme.colors.textSecondary}
              style={styles.description}
            >
              {task.description}
            </Text>
          ) : null}

          {/* Schedule Info */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.accent} />
              <Text variant="caption" color={theme.colors.textPrimary} weight="600">
                {task.dueDate ? formatDisplayDate(task.dueDate) : 'No date set'}
              </Text>
            </View>

            {task.isTimed && task.dueTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={16} color={theme.colors.accent} />
                <Text variant="caption" color={theme.colors.textPrimary} weight="600">
                  {formatDisplayTime(task.dueTime)}
                </Text>
              </View>
            ) : (
              <View style={styles.metaItem}>
                <Ionicons name="sunny-outline" size={16} color={theme.colors.warning} />
                <Text variant="caption" color={theme.colors.textMuted}>
                  Untimed task
                </Text>
              </View>
            )}
          </View>
        </Card>

        {/* Audit trail metadata */}
        <View style={styles.historyBox}>
          <Text variant="caption" color={theme.colors.textMuted}>
            Created: {new Date(task.createdAt).toLocaleString()}
          </Text>
          {task.completedAt && (
            <Text variant="caption" color={theme.colors.success}>
              Completed: {new Date(task.completedAt).toLocaleString()}
            </Text>
          )}
          {task.postponedAt && (
            <Text variant="caption" color={theme.colors.warning}>
              Postponed: {new Date(task.postponedAt).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Primary Action Button */}
        <Button
          title={isCompleted ? 'Mark as Incomplete' : 'Mark as Completed'}
          variant={isCompleted ? 'outline' : 'primary'}
          leftIcon={
            <Ionicons
              name={isCompleted ? 'refresh-outline' : 'checkmark-circle-outline'}
              size={18}
              color={isCompleted ? theme.colors.accent : theme.colors.accentForeground}
            />
          }
          onPress={handleToggle}
          style={styles.primaryActionBtn}
        />

        {/* Postpone Options Dropdown */}
        {showPostponeOptions ? (
          <Card variant="surface" style={styles.postponeCard}>
            <Text variant="subheading" style={styles.postponeTitle}>
              Postpone to:
            </Text>
            <View style={styles.postponeButtons}>
              <Button
                title="Tomorrow"
                variant="secondary"
                size="sm"
                onPress={handlePostponeTomorrow}
                style={styles.postponeBtn}
              />
              <Button
                title="Next Week"
                variant="secondary"
                size="sm"
                onPress={handlePostponeNextWeek}
                style={styles.postponeBtn}
              />
              <Button
                title="Cancel"
                variant="ghost"
                size="sm"
                onPress={() => setShowPostponeOptions(false)}
                style={styles.postponeBtn}
              />
            </View>
          </Card>
        ) : null}

        {/* Secondary Actions Grid */}
        <View style={styles.actionsGrid}>
          <Button
            title="Edit"
            variant="secondary"
            size="sm"
            leftIcon={<Ionicons name="pencil-outline" size={16} color={theme.colors.textPrimary} />}
            onPress={() => {
              onClose();
              onEdit(task);
            }}
            style={styles.gridBtn}
          />

          {!isCompleted && !isCancelled && (
            <Button
              title="Postpone"
              variant="secondary"
              size="sm"
              leftIcon={<Ionicons name="arrow-forward-outline" size={16} color={theme.colors.textPrimary} />}
              onPress={() => setShowPostponeOptions(!showPostponeOptions)}
              style={styles.gridBtn}
            />
          )}

          {!isCompleted && !isCancelled && (
            <Button
              title="Cancel"
              variant="secondary"
              size="sm"
              leftIcon={<Ionicons name="close-circle-outline" size={16} color={theme.colors.textSecondary} />}
              onPress={handleCancelTask}
              style={styles.gridBtn}
            />
          )}

          <Button
            title="Delete"
            variant="outline"
            size="sm"
            loading={isDeleting}
            leftIcon={<Ionicons name="trash-outline" size={16} color={theme.colors.error} />}
            onPress={confirmDelete}
            style={[styles.gridBtn, { borderColor: theme.colors.errorSubtle }]}
          />
        </View>
      </View>
    </ModalSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  detailCard: {
    padding: 16,
    marginBottom: 12,
  },
  titleRow: {
    marginBottom: 8,
  },
  titleText: {
    flex: 1,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  description: {
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyBox: {
    paddingHorizontal: 8,
    marginBottom: 16,
    gap: 2,
  },
  primaryActionBtn: {
    marginBottom: 12,
  },
  postponeCard: {
    padding: 12,
    marginBottom: 12,
  },
  postponeTitle: {
    marginBottom: 8,
  },
  postponeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  postponeBtn: {
    flex: 1,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridBtn: {
    flex: 1,
    minWidth: '45%',
  },
});
