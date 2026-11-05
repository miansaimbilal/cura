import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { MoodEntry } from '../../types/mood';
import { MOODS } from '../../constants';
import { formatDisplayDate, formatDisplayTime, toLocalDateString, toLocalTimeString } from '../../utils/date';

interface MoodCardProps {
  entry: MoodEntry;
  onEdit?: (entry: MoodEntry) => void;
  onDelete?: (id: string) => void;
}

export function MoodCard({ entry, onEdit, onDelete }: MoodCardProps) {
  const { theme } = useTheme();

  const moodDef = MOODS.find((m) => m.id === entry.moodType);
  const moodColor = moodDef ? theme.colors.moods[moodDef.colorKey] : theme.colors.accent;
  const iconName = moodDef ? moodDef.icon : 'heart';
  const label = moodDef ? moodDef.label : entry.moodType;

  const dateStr = toLocalDateString(entry.loggedAt);
  const timeStr = toLocalTimeString(entry.loggedAt);
  const formattedDate = formatDisplayDate(dateStr);
  const formattedTime = formatDisplayTime(timeStr);

  const handleDelete = () => {
    Alert.alert(
      'Delete Reflection',
      'Are you sure you want to delete this mood log? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete && onDelete(entry.id),
        },
      ]
    );
  };

  return (
    <Card variant="surface" style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.moodBadgeCol}>
          <View style={[styles.badge, { backgroundColor: moodColor }]}>
            <Ionicons name={iconName as any} size={18} color="#FFFFFF" />
          </View>
          <View style={styles.labelCol}>
            <Text variant="subheading" weight="600" color={theme.colors.textPrimary}>
              {label}
            </Text>
            <Text variant="caption" color={theme.colors.textMuted}>
              {formattedDate} • {formattedTime}
            </Text>
          </View>
        </View>

        {/* Edit and Delete Actions */}
        <View style={styles.actionsRow}>
          {onEdit && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onEdit(entry)}
              style={styles.actionBtn}
              accessibilityLabel="Edit mood entry"
            >
              <Ionicons name="pencil-outline" size={17} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDelete}
              style={styles.actionBtn}
              accessibilityLabel="Delete mood entry"
            >
              <Ionicons name="trash-outline" size={17} color={theme.colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {entry.note ? (
        <Text variant="bodySmall" color={theme.colors.textSecondary} style={styles.noteText}>
          {entry.note}
        </Text>
      ) : null}

      {entry.tags.length > 0 && (
        <View style={styles.tagRow}>
          {entry.tags.map((tag) => (
            <View key={tag} style={[styles.tagPill, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="caption" color={theme.colors.textMuted}>
                #{tag}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moodBadgeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  labelCol: {
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
    borderRadius: 6,
  },
  noteText: {
    marginTop: 10,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
