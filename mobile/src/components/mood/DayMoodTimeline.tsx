import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { MoodEntry } from '../../types/mood';
import { MOODS } from '../../constants';
import { formatDisplayTime, toLocalTimeString } from '../../utils/date';

interface DayMoodTimelineProps {
  entries: MoodEntry[];
  onSelectEntry?: (entry: MoodEntry) => void;
}

export function DayMoodTimeline({ entries, onSelectEntry }: DayMoodTimelineProps) {
  const { theme } = useTheme();

  if (entries.length === 0) {
    return (
      <Card variant="surface" style={styles.emptyCard}>
        <Ionicons name="sunny-outline" size={32} color={theme.colors.textMuted} />
        <Text variant="subheading" weight="600" style={styles.emptyTitle}>
          No moods logged for this day
        </Text>
        <Text variant="caption" color={theme.colors.textMuted} style={styles.emptySubtitle}>
          Tap any mood option above to record your feelings and reflections.
        </Text>
      </Card>
    );
  }

  // Sort chronologically ascending (earliest to latest in the day)
  const chronological = [...entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  return (
    <View style={styles.timelineContainer}>
      {chronological.map((entry, index) => {
        const moodDef = MOODS.find((m) => m.id === entry.moodType);
        const moodColor = moodDef ? theme.colors.moods[moodDef.colorKey] : theme.colors.accent;
        const iconName = moodDef ? moodDef.icon : 'heart';
        const label = moodDef ? moodDef.label : entry.moodType;
        const timeStr = formatDisplayTime(toLocalTimeString(entry.loggedAt));
        const isLast = index === chronological.length - 1;

        return (
          <View key={entry.id} style={styles.timelineItem}>
            {/* Left timeline connector and badge */}
            <View style={styles.leftCol}>
              <View style={[styles.moodBadge, { backgroundColor: moodColor }]}>
                <Ionicons name={iconName as any} size={16} color="#FFFFFF" />
              </View>
              {!isLast && <View style={[styles.connectingLine, { backgroundColor: theme.colors.borderSubtle }]} />}
            </View>

            {/* Right content card */}
            <Card
              variant="surface"
              style={styles.entryCard}
              onPress={onSelectEntry ? () => onSelectEntry(entry) : undefined}
            >
              <View style={styles.entryHeader}>
                <Text variant="subheading" weight="600" color={theme.colors.textPrimary}>
                  {label}
                </Text>
                <Text variant="caption" color={theme.colors.textMuted}>
                  {timeStr}
                </Text>
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
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timelineContainer: {
    paddingVertical: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  leftCol: {
    alignItems: 'center',
    width: 36,
    marginRight: 10,
  },
  moodBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  entryCard: {
    flex: 1,
    padding: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  noteText: {
    marginTop: 4,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    marginVertical: 12,
  },
  emptyTitle: {
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
