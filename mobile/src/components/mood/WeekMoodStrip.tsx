import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { MoodEntry } from '../../types/mood';
import { MOODS } from '../../constants';
import { toLocalDateString, getLocalDateString } from '../../utils/date';

interface WeekMoodStripProps {
  entries: MoodEntry[];
  startDate: string; // YYYY-MM-DD (Monday)
  onSelectDay?: (date: string, entries: MoodEntry[]) => void;
}

export function WeekMoodStrip({ entries, startDate, onSelectDay }: WeekMoodStripProps) {
  const { theme } = useTheme();
  const todayStr = getLocalDateString();

  // Group entries by local date
  const dayMap = new Map<string, MoodEntry[]>();
  for (const entry of entries) {
    const dStr = toLocalDateString(entry.loggedAt);
    if (!dayMap.has(dStr)) {
      dayMap.set(dStr, []);
    }
    dayMap.get(dStr)!.push(entry);
  }

  // Generate 7 days from startDate (Monday)
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startYear, startMonth - 1, startDay + i, 12, 0, 0);
    const dateStr = getLocalDateString(d);
    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      dateStr,
      dayNum: d.getDate(),
      weekday: weekdayLabels[d.getDay()],
      isToday: dateStr === todayStr,
      entries: dayMap.get(dateStr) || [],
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.gridRow}>
        {weekDays.map((day) => {
          const hasEntries = day.entries.length > 0;

          return (
            <TouchableOpacity
              key={day.dateStr}
              activeOpacity={0.7}
              onPress={onSelectDay ? () => onSelectDay(day.dateStr, day.entries) : undefined}
              style={[
                styles.dayColumn,
                {
                  backgroundColor: day.isToday
                    ? theme.colors.surfaceElevated
                    : theme.colors.surfaceSubtle,
                  borderColor: day.isToday ? theme.colors.accent : theme.colors.borderSubtle,
                  borderWidth: day.isToday ? 1.5 : 1,
                },
              ]}
            >
              <Text
                variant="caption"
                weight="600"
                color={day.isToday ? theme.colors.accent : theme.colors.textMuted}
                style={styles.weekdayText}
              >
                {day.weekday}
              </Text>
              <Text
                variant="bodySmall"
                weight="700"
                color={day.isToday ? theme.colors.textPrimary : theme.colors.textSecondary}
                style={styles.dayNumText}
              >
                {day.dayNum}
              </Text>

              {/* Mood glyphs container */}
              <View style={styles.glyphsContainer}>
                {hasEntries ? (
                  day.entries.slice(0, 3).map((entry) => {
                    const moodDef = MOODS.find((m) => m.id === entry.moodType);
                    const color = moodDef
                      ? theme.colors.moods[moodDef.colorKey]
                      : theme.colors.accent;
                    const iconName = moodDef ? moodDef.icon : 'heart';

                    return (
                      <View key={entry.id} style={[styles.miniGlyph, { backgroundColor: color }]}>
                        <Ionicons name={iconName as any} size={11} color="#FFFFFF" />
                      </View>
                    );
                  })
                ) : (
                  <Text variant="caption" color={theme.colors.textMuted}>
                    —
                  </Text>
                )}
                {day.entries.length > 3 && (
                  <Text variant="caption" color={theme.colors.textMuted} style={styles.moreText}>
                    +{day.entries.length - 3}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 10,
    minHeight: 110,
  },
  weekdayText: {
    fontSize: 11,
    marginBottom: 2,
  },
  dayNumText: {
    fontSize: 13,
    marginBottom: 8,
  },
  glyphsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
  },
  miniGlyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 9,
    marginTop: 2,
  },
});
