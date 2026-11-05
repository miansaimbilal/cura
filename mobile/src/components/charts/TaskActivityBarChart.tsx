import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { TaskActivityDay } from '../../types/analytics';

interface TaskActivityBarChartProps {
  data: TaskActivityDay[];
  height?: number;
}

export function TaskActivityBarChart({
  data,
  height = 140,
}: TaskActivityBarChartProps) {
  const { theme } = useTheme();

  const totalCompletions = data.reduce((acc, d) => acc + d.completedCount, 0);

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text variant="caption" color={theme.colors.textMuted}>
          No activity records for this period
        </Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.completedCount), 3); // At least 3 for grid scale
  const chartWidth = Math.min(Dimensions.get('window').width - 64, 340);
  const chartHeight = height - 30; // Reserve space for X-axis labels
  const barGap = 6;
  const numBars = data.length;
  const availableBarWidth = (chartWidth - barGap * (numBars - 1)) / numBars;
  const barWidth = Math.max(Math.min(availableBarWidth, 24), 6);

  // Offset so bars are centered in chart
  const contentWidth = numBars * barWidth + (numBars - 1) * barGap;
  const startX = Math.max((chartWidth - contentWidth) / 2, 0);

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height}>
        {/* Background baseline */}
        <Line
          x1={0}
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke={theme.colors.borderSubtle}
          strokeWidth={1}
        />

        {/* Top limit grid line */}
        <Line
          x1={0}
          y1={4}
          x2={chartWidth}
          y2={4}
          stroke={theme.colors.borderSubtle}
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Bars and X-axis labels */}
        {data.map((item, index) => {
          const x = startX + index * (barWidth + barGap);
          const barRatio = item.completedCount / maxVal;
          const barH = Math.max(barRatio * (chartHeight - 8), item.completedCount > 0 ? 4 : 2);
          const y = chartHeight - barH;
          const isPositive = item.completedCount > 0;
          const barColor = isPositive ? theme.colors.success : theme.colors.surfaceSubtle;

          // For month view with many days, show label only every 5 days or first/last
          const showLabel =
            numBars <= 7 || index === 0 || index === numBars - 1 || index % 5 === 0;

          // Clean day label (e.g. "Mon" or "1" for month view)
          const displayLabel = numBars <= 7 ? item.dayLabel.split(' ')[0] : item.date.split('-')[2];

          return (
            <React.Fragment key={item.date}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={Math.min(barWidth / 2, 4)}
                fill={barColor}
              />
              {showLabel && (
                <SvgText
                  x={x + barWidth / 2}
                  y={height - 8}
                  fontSize={10}
                  fill={theme.colors.textMuted}
                  textAnchor="middle"
                  fontWeight="500"
                >
                  {displayLabel}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={styles.footerRow}>
        <Text variant="caption" color={theme.colors.textMuted}>
          {totalCompletions === 0
            ? 'No tasks completed yet in this period'
            : `${totalCompletions} ${totalCompletions === 1 ? 'task' : 'tasks'} completed in period`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: 4,
  },
  footerRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
});
