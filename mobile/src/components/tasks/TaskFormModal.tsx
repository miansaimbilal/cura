import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { useTheme } from '../../hooks/useTheme';
import { Task, CreateTaskInput, UpdateTaskInput } from '../../types/task';
import {
  getLocalDateString,
  getTomorrowDateString,
  isValidDateString,
  isValidTimeString,
} from '../../utils/date';

export interface TaskFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  initialTask?: Task | null;
}

interface FormInnerProps {
  initialTask?: Task | null;
  onClose: () => void;
  onSave: (data: CreateTaskInput | UpdateTaskInput) => Promise<void>;
}

const FormInner: React.FC<FormInnerProps> = ({ initialTask, onClose, onSave }) => {
  const { theme } = useTheme();
  const isEditing = Boolean(initialTask);

  const todayStr = getLocalDateString();
  const tomorrowStr = getTomorrowDateString();

  const getInitialDateMode = (): 'today' | 'tomorrow' | 'custom' | 'none' => {
    if (!initialTask) return 'today';
    if (!initialTask.dueDate) return 'none';
    if (initialTask.dueDate === todayStr) return 'today';
    if (initialTask.dueDate === tomorrowStr) return 'tomorrow';
    return 'custom';
  };

  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [dateMode, setDateMode] = useState<'today' | 'tomorrow' | 'custom' | 'none'>(getInitialDateMode);
  const [customDate, setCustomDate] = useState(initialTask?.dueDate || todayStr);
  const [isTimed, setIsTimed] = useState(initialTask?.isTimed || false);
  const [dueTime, setDueTime] = useState(initialTask?.dueTime || '10:00');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDateModeChange = (mode: 'today' | 'tomorrow' | 'custom' | 'none') => {
    setDateMode(mode);
    setDateError(null);
    if (mode === 'today') {
      setCustomDate(getLocalDateString());
    } else if (mode === 'tomorrow') {
      setCustomDate(getTomorrowDateString());
    }
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError('Task title is required');
      return;
    }
    if (trimmedTitle.length > 255) {
      setTitleError('Task title must be under 255 characters');
      return;
    }

    let resolvedDueDate: string | null = null;
    if (dateMode === 'today') {
      resolvedDueDate = getLocalDateString();
    } else if (dateMode === 'tomorrow') {
      resolvedDueDate = getTomorrowDateString();
    } else if (dateMode === 'custom') {
      const trimmedDate = customDate.trim();
      if (!isValidDateString(trimmedDate)) {
        setDateError('Invalid date format (must be YYYY-MM-DD)');
        return;
      }
      resolvedDueDate = trimmedDate;
    }

    let resolvedDueTime: string | null = null;
    if (isTimed) {
      const trimmedTime = dueTime.trim();
      if (!isValidTimeString(trimmedTime)) {
        setTimeError('Invalid time format (must be HH:MM in 24h format)');
        return;
      }
      resolvedDueTime = trimmedTime;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        title: trimmedTitle,
        description: description.trim() || null,
        dueDate: resolvedDueDate,
        dueTime: resolvedDueTime,
        isTimed,
      });
      onClose();
    } catch (err: any) {
      setTitleError(err?.message || 'Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickTimes = [
    { label: '09:00 AM', value: '09:00' },
    { label: '02:00 PM', value: '14:00' },
    { label: '06:00 PM', value: '18:00' },
    { label: '09:00 PM', value: '21:00' },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title Input */}
      <Input
        label="Title"
        placeholder="e.g. Meditate for 10 minutes"
        value={title}
        onChangeText={(val) => {
          setTitle(val);
          if (titleError) setTitleError(null);
        }}
        error={titleError || undefined}
        maxLength={255}
        autoFocus={!isEditing}
      />

      {/* Description Input */}
      <Input
        label="Description (Optional)"
        placeholder="Add notes, context, or links..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        style={styles.descInput}
      />

      {/* Date Selection Section */}
      <View style={styles.section}>
        <Text variant="subheading" style={styles.sectionLabel}>
          Scheduled Date
        </Text>
        <View style={styles.pillRow}>
          {(['today', 'tomorrow', 'custom', 'none'] as const).map((mode) => {
            const isSelected = dateMode === mode;
            const labels = {
              today: 'Today',
              tomorrow: 'Tomorrow',
              custom: 'Custom Date',
              none: 'No Date',
            };
            return (
              <TouchableOpacity
                key={mode}
                activeOpacity={0.7}
                onPress={() => handleDateModeChange(mode)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: isSelected ? theme.colors.accent : theme.colors.surfaceElevated,
                    borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  weight={isSelected ? '700' : '500'}
                  color={isSelected ? theme.colors.accentForeground : theme.colors.textSecondary}
                >
                  {labels[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {dateMode === 'custom' && (
          <Input
            placeholder="YYYY-MM-DD (e.g. 2026-11-05)"
            value={customDate}
            onChangeText={(val) => {
              setCustomDate(val);
              if (dateError) setDateError(null);
            }}
            error={dateError || undefined}
            leftIcon={<Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />}
            containerStyle={styles.customDateInput}
          />
        )}
      </View>

      {/* Timed Task Toggle Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text variant="subheading">Timed Reminder</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setIsTimed(!isTimed)}
            style={[
              styles.togglePill,
              {
                backgroundColor: isTimed ? theme.colors.accent : theme.colors.surfaceElevated,
                borderColor: isTimed ? theme.colors.accent : theme.colors.borderSubtle,
              },
            ]}
          >
            <Ionicons
              name={isTimed ? 'time' : 'time-outline'}
              size={16}
              color={isTimed ? theme.colors.accentForeground : theme.colors.textMuted}
            />
            <Text
              variant="caption"
              weight="600"
              color={isTimed ? theme.colors.accentForeground : theme.colors.textSecondary}
            >
              {isTimed ? 'Timed Task' : 'Untimed (End of Day)'}
            </Text>
          </TouchableOpacity>
        </View>

        {isTimed && (
          <View style={styles.timeSection}>
            {/* Preset quick times */}
            <View style={styles.quickTimeRow}>
              {quickTimes.map((qt) => {
                const isSelected = dueTime === qt.value;
                return (
                  <TouchableOpacity
                    key={qt.value}
                    activeOpacity={0.7}
                    onPress={() => {
                      setDueTime(qt.value);
                      setTimeError(null);
                    }}
                    style={[
                      styles.quickTimeChip,
                      {
                        backgroundColor: isSelected ? theme.colors.accentSubtle : theme.colors.surfaceElevated,
                        borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={isSelected ? theme.colors.accent : theme.colors.textSecondary}
                      weight={isSelected ? '700' : '500'}
                    >
                      {qt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Input
              label="Custom Time (HH:MM in 24h format)"
              placeholder="e.g. 14:30"
              value={dueTime}
              onChangeText={(val) => {
                setDueTime(val);
                if (timeError) setTimeError(null);
              }}
              error={timeError || undefined}
              leftIcon={<Ionicons name="time-outline" size={18} color={theme.colors.textMuted} />}
              containerStyle={styles.customTimeInput}
            />
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <Button
          title="Cancel"
          variant="outline"
          onPress={onClose}
          style={styles.actionBtn}
        />
        <Button
          title={isEditing ? 'Save Changes' : 'Create Task'}
          variant="primary"
          loading={isSubmitting}
          onPress={handleSubmit}
          style={styles.actionBtn}
        />
      </View>
    </ScrollView>
  );
};

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  visible,
  onClose,
  onSave,
  initialTask,
}) => {
  const isEditing = Boolean(initialTask);

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit Task' : 'New Task'}
      subtitle={isEditing ? 'Modify your task details' : 'What would you like to achieve?'}
    >
      {visible ? (
        <FormInner
          key={initialTask ? initialTask.id : 'new-task'}
          initialTask={initialTask}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </ModalSheet>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    maxHeight: 520,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  customDateInput: {
    marginTop: 8,
    marginBottom: 0,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  timeSection: {
    marginTop: 8,
  },
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  quickTimeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  customTimeInput: {
    marginTop: 4,
    marginBottom: 0,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
});
