import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { LoadingIndicator } from '../../src/components/ui/LoadingIndicator';
import { useTheme } from '../../src/hooks/useTheme';
import { useMood } from '../../src/hooks/useMood';
import { useTasks } from '../../src/hooks/useTasks';
import { getDatabase } from '../../src/db/client';
import {
  AnalyticsPeriod,
  DateRange,
  TaskActivityDay,
  TaskCompletionMetric,
} from '../../src/types/analytics';
import { MoodDistribution, MoodEntry } from '../../src/types/mood';
import { MOODS } from '../../src/constants';
import {
  getLocalDayRange,
  getCalendarWeekRange,
  getCalendarMonthRange,
} from '../../src/utils/date';
import {
  getTaskCompletionForPeriod,
  getTaskActivityForPeriod,
} from '../../src/utils/analytics';
import {
  getMoodDistribution,
  getMoodEntriesByDateRange,
} from '../../src/db/moodRepository';
import {
  TaskProgressRing,
  MoodDistributionDonut,
  TaskActivityBarChart,
} from '../../src/components/charts';
import {
  DayMoodTimeline,
  WeekMoodStrip,
  MonthMoodMatrix,
} from '../../src/components/mood';

export default function AnalyticsScreen() {
  const { theme } = useTheme();
  const { moodEntries } = useMood();
  const { tasks } = useTasks();

  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [currentDate] = useState<Date>(new Date());

  // Derive dateRange directly from period and currentDate
  const dateRange: DateRange = useMemo(() => {
    switch (period) {
      case 'day':
        return getLocalDayRange(currentDate);
      case 'month':
        return getCalendarMonthRange(currentDate);
      case 'week':
      default:
        return getCalendarWeekRange(currentDate);
    }
  }, [period, currentDate]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Analytics Metrics State
  const [moodDistribution, setMoodDistribution] = useState<MoodDistribution>({
    total: 0,
    items: [],
    mostFrequentMood: null,
  });
  const [periodMoodEntries, setPeriodMoodEntries] = useState<MoodEntry[]>([]);
  const [taskCompletion, setTaskCompletion] = useState<TaskCompletionMetric>({
    total: 0,
    completed: 0,
    percentage: null,
  });
  const [taskActivity, setTaskActivity] = useState<TaskActivityDay[]>([]);

  // Load deterministic analytics data from SQLite
  const loadAnalytics = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [entries, dist, comp, act] = await Promise.all([
        getMoodEntriesByDateRange(db, dateRange.startISO, dateRange.endISO),
        getMoodDistribution(db, dateRange.startISO, dateRange.endISO),
        getTaskCompletionForPeriod(db, dateRange),
        getTaskActivityForPeriod(db, dateRange),
      ]);

      setPeriodMoodEntries(entries);
      setMoodDistribution(dist);
      setTaskCompletion(comp);
      setTaskActivity(act);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    let isCancelled = false;
    getDatabase()
      .then(async (db) => {
        const [entries, dist, comp, act] = await Promise.all([
          getMoodEntriesByDateRange(db, dateRange.startISO, dateRange.endISO),
          getMoodDistribution(db, dateRange.startISO, dateRange.endISO),
          getTaskCompletionForPeriod(db, dateRange),
          getTaskActivityForPeriod(db, dateRange),
        ]);

        if (!isCancelled) {
          setPeriodMoodEntries(entries);
          setMoodDistribution(dist);
          setTaskCompletion(comp);
          setTaskActivity(act);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load analytics data:', err);
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [dateRange, moodEntries, tasks]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAnalytics();
  };

  // Find most frequent mood definition
  const frequentMoodDef = MOODS.find((m) => m.id === moodDistribution.mostFrequentMood);
  const frequentColor = frequentMoodDef
    ? theme.colors.moods[frequentMoodDef.colorKey]
    : theme.colors.textMuted;

  const totalTasksFinishedInPeriod = taskActivity.reduce((acc, d) => acc + d.completedCount, 0);

  return (
    <ScreenContainer
      header={
        <Header
          title="Analytics"
          subtitle="Your patterns, habits, and progress"
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Period Selector Tabs (Day / Week / Month) */}
        <View style={styles.periodSelectorWrapper}>
          <View style={[styles.periodPillContainer, { backgroundColor: theme.colors.surfaceSubtle }]}>
            {(['day', 'week', 'month'] as AnalyticsPeriod[]).map((p) => {
              const isSelected = period === p;
              const label = p.toUpperCase();
              return (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.7}
                  onPress={() => setPeriod(p)}
                  style={[
                    styles.periodTab,
                    {
                      backgroundColor: isSelected ? theme.colors.accent : 'transparent',
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    weight={isSelected ? '700' : '500'}
                    color={isSelected ? '#FFFFFF' : theme.colors.textMuted}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text variant="caption" color={theme.colors.textSecondary} style={styles.dateRangeLabel}>
            {dateRange.label}
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingWrapper}>
            <LoadingIndicator size="large" />
            <Text variant="caption" color={theme.colors.textMuted} style={{ marginTop: 8 }}>
              Calculating deterministic analytics...
            </Text>
          </View>
        ) : (
          <>
            {/* Key Metric Summary Cards */}
            <View style={styles.metricsGrid}>
              {/* Most Frequent Mood Card */}
              <Card variant="surface" style={styles.metricCard}>
                <Text variant="caption" color={theme.colors.textMuted}>
                  PRIMARY MOOD
                </Text>
                <View style={styles.metricValueRow}>
                  {frequentMoodDef ? (
                    <>
                      <View style={[styles.miniBadge, { backgroundColor: frequentColor }]}>
                        <Ionicons name={frequentMoodDef.icon as any} size={14} color="#FFFFFF" />
                      </View>
                      <Text variant="subheading" weight="700" numberOfLines={1}>
                        {frequentMoodDef.label}
                      </Text>
                    </>
                  ) : (
                    <Text variant="subheading" color={theme.colors.textMuted}>
                      —
                    </Text>
                  )}
                </View>
                <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                  {moodDistribution.total > 0
                    ? `${moodDistribution.total} logs recorded`
                    : 'No mood logs yet'}
                </Text>
              </Card>

              {/* Task Completion Rate Card */}
              <Card variant="surface" style={styles.metricCard}>
                <Text variant="caption" color={theme.colors.textMuted}>
                  COMPLETION RATE
                </Text>
                <View style={styles.metricValueRow}>
                  <Text variant="heading2" weight="700">
                    {taskCompletion.percentage !== null ? `${taskCompletion.percentage}%` : '—'}
                  </Text>
                </View>
                <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                  {taskCompletion.total > 0
                    ? `${taskCompletion.completed} of ${taskCompletion.total} tasks`
                    : 'No tasks scheduled'}
                </Text>
              </Card>
            </View>

            {/* Task Completion Progress Ring Section */}
            <SectionHeader
              title="Task Completion Rate"
              subtitle="Scheduled tasks completed in this calendar period"
            />
            <Card variant="surface" style={styles.chartCard}>
              <View style={styles.ringCardRow}>
                <TaskProgressRing
                  total={taskCompletion.total}
                  completed={taskCompletion.completed}
                  percentage={taskCompletion.percentage}
                  size={120}
                  strokeWidth={11}
                />
                <View style={styles.ringTextCol}>
                  <Text variant="subheading" weight="600">
                    {taskCompletion.total === 0
                      ? 'No scheduled tasks'
                      : taskCompletion.percentage === 100
                      ? 'All tasks completed!'
                      : `${taskCompletion.completed} completed, ${taskCompletion.total - taskCompletion.completed} remaining`}
                  </Text>
                  <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 4 }}>
                    {taskCompletion.total === 0
                      ? 'Add or schedule tasks to track cohort completion rates.'
                      : 'Excludes cancelled and deleted tasks.'}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Task Activity Bar Chart Section */}
            <SectionHeader
              title="Daily Task Activity"
              subtitle={`Task completion events per day (${totalTasksFinishedInPeriod} total finished)`}
            />
            <Card variant="surface" style={styles.chartCard}>
              <TaskActivityBarChart data={taskActivity} height={150} />
            </Card>

            {/* Mood Rhythm / Timeline Section */}
            <SectionHeader
              title={
                period === 'day'
                  ? "Today's Mood Timeline"
                  : period === 'week'
                  ? 'Weekly Mood Rhythm'
                  : 'Monthly Mood Calendar'
              }
              subtitle="Actual recorded mood entries across the calendar period"
            />
            <Card variant="surface" style={styles.chartCard}>
              {period === 'day' && <DayMoodTimeline entries={periodMoodEntries} />}
              {period === 'week' && (
                <WeekMoodStrip
                  entries={periodMoodEntries}
                  startDate={dateRange.startDate}
                />
              )}
              {period === 'month' && (
                <MonthMoodMatrix
                  entries={periodMoodEntries}
                  referenceDate={currentDate}
                />
              )}
            </Card>

            {/* Mood Distribution Donut Chart Section */}
            <SectionHeader
              title="Mood Distribution"
              subtitle="Proportion of recorded mood categories"
            />
            <Card variant="surface" style={[styles.chartCard, { marginBottom: 32 }]}>
              <MoodDistributionDonut
                items={moodDistribution.items}
                total={moodDistribution.total}
                size={130}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  periodSelectorWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  periodPillContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    width: 240,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  dateRangeLabel: {
    marginTop: 8,
  },
  loadingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    padding: 14,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  miniBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCard: {
    padding: 16,
    marginBottom: 16,
  },
  ringCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringTextCol: {
    flex: 1,
  },
});
