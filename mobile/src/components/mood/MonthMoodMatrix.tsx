import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { MoodEntry } from '../../types/mood';
import { MOODS } from '../../constants';
import { toLocalDateString, getLocalDateString } from '../../utils/date';

interface MonthMoodMatrixProps {
  entries: MoodEntry[];
  referenceDate?: Date;
  onSelectDay?: (dateStr: string, entries: MoodEntry[]) => void;
}

export function MonthMoodMatrix({
  entries,
  referenceDate = new Date(),
  onSelectDay,
}: MonthMoodMatrixProps) {
  const { theme } = useTheme();
  const todayStr = getLocalDateString();

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  // Map entries by local date
  const dayMap = new Map<string, MoodEntry[]>();
  for (const entry of entries) {
    const dStr = toLocalDateString(entry.loggedAt);
    if (!dayMap.has(dStr)) {
      dayMap.set(dStr, []);
    }
    dayMap.get(dStr)!.push(entry);
  }

  // First day of month and total days in month
  const firstDayOfMonth = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Day of week of 1st day (0 is Sun, 1 is Mon, ... 6 is Sat)
  // Distance from Monday (0: Mon, 1: Tue, ... 6: Sun)
  const firstDayDow = firstDayOfMonth.getDay();
  const leadingBlankDays = firstDayDow === 0 ? 6 : firstDayDow - 1;

  const weekdayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Build matrix cells: leading blanks + days of month
  const cells: {
    dayNum: number | null;
    dateStr: string | null;
    isToday: boolean;
    entries: MoodEntry[];
  }[] = [];

  for (let i = 0; i < leadingBlankDays; i++) {
    cells.push({ dayNum: null, dateStr: null, isToday: false, entries: [] });
  }

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    const dateStr = getLocalDateString(d);
    cells.push({
      dayNum: day,
      dateStr,
      isToday: dateStr === todayStr,
      entries: dayMap.get(dateStr) || [],
    });
  }

  return (
    <View style={styles.container}>
      {/* Weekday headers */}
      <View style={styles.headerRow}>
        {weekdayHeaders.map((hdr, i) => (
          <View key={i} style={styles.headerCell}>
            <Text variant="caption" weight="600" color={theme.colors.textMuted}>
              {hdr}
            </Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.matrixGrid}>
        {cells.map((cell, index) => {
          if (!cell.dayNum || !cell.dateStr) {
            return <View key={`blank-${index}`} style={styles.dayCell} />;
          }

          const hasEntries = cell.entries.length > 0;

          return (
            <TouchableOpacity
              key={cell.dateStr}
              activeOpacity={hasEntries ? 0.7 : 1}
              onPress={
                hasEntries && onSelectDay
                  ? () => onSelectDay(cell.dateStr!, cell.entries)
                  : undefined
              }
              style={[
                styles.dayCell,
                {
                  backgroundColor: cell.isToday
                    ? theme.colors.surfaceElevated
                    : hasEntries
                    ? theme.colors.surfaceSubtle
                    : 'transparent',
                  borderColor: cell.isToday ? theme.colors.accent : 'transparent',
                  borderWidth: cell.isToday ? 1 : 0,
                },
              ]}
            >
              <Text
                variant="caption"
                weight={cell.isToday || hasEntries ? '600' : '400'}
                color={
                  cell.isToday
                    ? theme.colors.accent
                    : hasEntries
                    ? theme.colors.textPrimary
                    : theme.colors.textMuted
                }
                style={styles.dayNum}
              >
                {cell.dayNum}
              </Text>

              {/* Mood indicators (up to 3 colored dots) */}
              <View style={styles.dotsRow}>
                {cell.entries.slice(0, 3).map((entry) => {
                  const moodDef = MOODS.find((m) => m.id === entry.moodType);
                  const dotColor = moodDef
                    ? theme.colors.moods[moodDef.colorKey]
                    : theme.colors.accent;
                  return (
                    <View
                      key={entry.id}
                      style={[styles.moodDot, { backgroundColor: dotColor }]}
                    />
                  );
                })}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  matrixGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 2,
  },
  dayNum: {
    fontSize: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 6,
    marginTop: 2,
  },
  moodDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
