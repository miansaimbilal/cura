import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { useTheme } from '../../src/hooks/useTheme';

type FilterType = 'all' | 'today' | 'upcoming' | 'completed';

export default function TasksScreen() {
  const { theme } = useTheme();
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [showEmptyPreview, setShowEmptyPreview] = useState(false);

  const filterChips: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All (Demo)' },
    { id: 'today', label: 'Today (Demo)' },
    { id: 'upcoming', label: 'Upcoming (Demo)' },
    { id: 'completed', label: 'Completed (Demo)' },
  ];

  return (
    <ScreenContainer
      header={
        <Header
          title="Tasks"
          subtitle="Design-system preview (Phase 3 feature)"
          rightElement={
            <Button
              title={showEmptyPreview ? 'Show Cards' : 'Show Empty'}
              size="sm"
              variant="outline"
              onPress={() => setShowEmptyPreview(!showEmptyPreview)}
            />
          }
        />
      }
    >
      {/* Visual Filter Chips Demonstration */}
      <View style={styles.filterRow}>
        {filterChips.map((f) => {
          const isActive = selectedFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.7}
              onPress={() => setSelectedFilter(f.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
                  borderColor: isActive ? theme.colors.accent : theme.colors.borderSubtle,
                },
              ]}
            >
              <Text
                variant="caption"
                color={isActive ? theme.colors.accentForeground : theme.colors.textSecondary}
                weight={isActive ? '600' : '500'}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Empty State Component Demonstration or Sample Cards */}
      {showEmptyPreview ? (
        <Card variant="surface" style={{ marginTop: 12 }}>
          <EmptyState
            title="Empty State Component Demo"
            description="This component demonstrates the design-system empty state layout. Task creation and persistence will be built in Phase 3."
            icon={<Ionicons name="checkbox-outline" size={32} color={theme.colors.accent} />}
            actionTitle="Return to Card Previews"
            onAction={() => setShowEmptyPreview(false)}
          />
        </Card>
      ) : (
        <View style={styles.taskList}>
          {/* Sample Card 1: Timed Task Item */}
          <Card variant="surface" style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <View style={[styles.priorityTag, { backgroundColor: theme.colors.accentSubtle }]}>
                <Ionicons name="time-outline" size={12} color={theme.colors.accent} />
                <Text variant="caption" color={theme.colors.accent} style={styles.priorityText}>
                  Sample Timed Task • 10:00 AM
                </Text>
              </View>
              <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textMuted} />
            </View>
            <View style={styles.taskContentRow}>
              <View style={[styles.checkbox, { borderColor: theme.colors.borderStrong }]}>
                <Ionicons name="ellipse" size={8} color="transparent" />
              </View>
              <View style={styles.taskTitleCol}>
                <Text variant="bodyLarge" weight="600">
                  Sample: Morning reflection check-in
                </Text>
                <Text variant="bodySmall" color={theme.colors.textSecondary} style={styles.taskDesc}>
                  Visual demonstration of a timed task item with subtitle
                </Text>
              </View>
            </View>
          </Card>

          {/* Sample Card 2: Untimed Task Item */}
          <Card variant="surface" style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <View style={[styles.priorityTag, { backgroundColor: theme.colors.warningSubtle }]}>
                <Ionicons name="sunny-outline" size={12} color={theme.colors.warning} />
                <Text variant="caption" color={theme.colors.warning} style={styles.priorityText}>
                  Sample Untimed Task • End of Day
                </Text>
              </View>
            </View>
            <View style={styles.taskContentRow}>
              <View style={[styles.checkbox, { borderColor: theme.colors.borderStrong }]} />
              <View style={styles.taskTitleCol}>
                <Text variant="bodyLarge" weight="600">
                  Sample: Read for 20 minutes
                </Text>
                <Text variant="bodySmall" color={theme.colors.textSecondary} style={styles.taskDesc}>
                  Visual demonstration of an untimed task item
                </Text>
              </View>
            </View>
          </Card>

          {/* Sample Card 3: Completed Task Item */}
          <Card variant="surface" style={[styles.taskCard, { opacity: 0.75 }]}>
            <View style={styles.taskHeader}>
              <View style={[styles.priorityTag, { backgroundColor: theme.colors.successSubtle }]}>
                <Ionicons name="checkmark-done" size={12} color={theme.colors.success} />
                <Text variant="caption" color={theme.colors.success} style={styles.priorityText}>
                  Sample Completed Task
                </Text>
              </View>
            </View>
            <View style={styles.taskContentRow}>
              <View style={[styles.checkbox, { backgroundColor: theme.colors.success, borderColor: theme.colors.success }]}>
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <View style={styles.taskTitleCol}>
                <Text
                  variant="bodyLarge"
                  color={theme.colors.textMuted}
                  style={{ textDecorationLine: 'line-through' }}
                >
                  Sample: Drink a glass of water
                </Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      {/* Scope Disclaimer */}
      <View style={[styles.noteBox, { backgroundColor: theme.colors.surfaceSubtle }]}>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Phase 1 layout preview. Actual task creation, editing, persistent storage, and reminder notifications belong to Phase 3.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  taskList: {
    gap: 12,
  },
  taskCard: {
    marginBottom: 0,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priorityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 12,
  },
  taskTitleCol: {
    flex: 1,
  },
  taskDesc: {
    marginTop: 2,
  },
  noteBox: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
  },
});
