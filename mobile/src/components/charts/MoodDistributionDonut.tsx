import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { MoodDistributionItem } from '../../types/mood';

interface MoodDistributionDonutProps {
  items: MoodDistributionItem[];
  total: number;
  size?: number;
  strokeWidth?: number;
}

export function MoodDistributionDonut({
  items,
  total,
  size = 140,
  strokeWidth = 14,
}: MoodDistributionDonutProps) {
  const { theme } = useTheme();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Purely calculate stroke offsets without mutating render-scope variables
  const { segments } = items.reduce<{
    segments: (MoodDistributionItem & { strokeDasharray: string; strokeDashoffset: number })[];
    accumulated: number;
  }>(
    (acc, item) => {
      const ratio = total > 0 ? item.count / total : 0;
      const strokeDasharray = `${ratio * circumference} ${circumference}`;
      const strokeDashoffset = -acc.accumulated * circumference;
      return {
        segments: [
          ...acc.segments,
          {
            ...item,
            strokeDasharray,
            strokeDashoffset,
          },
        ],
        accumulated: acc.accumulated + ratio,
      };
    },
    { segments: [], accumulated: 0 }
  );

  if (total === 0 || items.length === 0) {
    return (
      <View
        accessible={true}
        accessibilityRole="summary"
        accessibilityLabel="Mood distribution: No moods recorded in this period"
        style={styles.emptyContainer}
      >
        <View style={[styles.donutWrapper, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.colors.surfaceSubtle}
              strokeWidth={strokeWidth}
              fill="none"
            />
          </Svg>
          <View style={styles.centerContent}>
            <Text variant="heading3" color={theme.colors.textMuted}>
              0
            </Text>
            <Text variant="caption" color={theme.colors.textMuted}>
              Moods
            </Text>
          </View>
        </View>
        <Text variant="caption" color={theme.colors.textMuted} style={styles.emptyText}>
          No moods recorded in this period
        </Text>
      </View>
    );
  }

  const a11ySummary = `Mood distribution: ${total} total logs. ${items.map((i) => `${i.label}: ${i.percentage}%`).join(', ')}`;

  return (
    <View
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={a11ySummary}
      style={styles.container}
    >
      <View style={[styles.donutWrapper, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {/* Background Base Ring */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.colors.surfaceSubtle}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Slices */}
            {segments.map((seg) => (
              <Circle
                key={seg.moodType}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                strokeLinecap="butt"
                fill="none"
              />
            ))}
          </G>
        </Svg>
        <View style={styles.centerContent}>
          <Text variant="heading2" weight="700">
            {total}
          </Text>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {total === 1 ? 'Log' : 'Logs'}
          </Text>
        </View>
      </View>

      {/* Legend Rows */}
      <View style={styles.legendContainer}>
        {items.map((item) => (
          <View key={item.moodType} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text variant="bodySmall" weight="500" style={styles.legendLabel}>
              {item.label}
            </Text>
            <Text variant="caption" color={theme.colors.textMuted} style={styles.legendCount}>
              {item.count} ({item.percentage}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  donutWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendContainer: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: '45%',
    paddingVertical: 3,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    flex: 1,
  },
  legendCount: {
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyText: {
    marginTop: 10,
  },
});
