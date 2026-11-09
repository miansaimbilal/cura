import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';

interface TaskProgressRingProps {
  total: number;
  completed: number;
  percentage: number | null;
  size?: number;
  strokeWidth?: number;
  showDetails?: boolean;
}

export function TaskProgressRing({
  total,
  completed,
  percentage,
  size = 140,
  strokeWidth = 12,
  showDetails = true,
}: TaskProgressRingProps) {
  const { theme } = useTheme();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = total > 0 && percentage !== null ? Math.min(Math.max(percentage / 100, 0), 1) : 0;
  const strokeDashoffset = circumference - progressRatio * circumference;

  const isCompletedAll = total > 0 && completed === total;
  const strokeColor = isCompletedAll ? theme.colors.success : theme.colors.accent;

  const a11ySummary =
    total === 0
      ? 'Task progress: No tasks scheduled'
      : `Task progress: ${completed} of ${total} tasks completed, ${percentage}%`;

  return (
    <View
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={a11ySummary}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        {/* Background Track Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.surfaceSubtle}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Fill Circle */}
        {total > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="none"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>

      <View style={styles.centerContent}>
        {total === 0 ? (
          <>
            <Text variant="heading2" color={theme.colors.textMuted}>
              —
            </Text>
            {showDetails && (
              <Text variant="caption" color={theme.colors.textMuted} style={styles.subtext}>
                No tasks
              </Text>
            )}
          </>
        ) : (
          <>
            <Text variant="heading2" weight="700">
              {percentage}%
            </Text>
            {showDetails && (
              <Text variant="caption" color={theme.colors.textSecondary} style={styles.subtext}>
                {completed} of {total}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtext: {
    marginTop: 2,
  },
});
