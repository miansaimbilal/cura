import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '../ui/Text';
import { useTheme } from '../../hooks/useTheme';
import { TaskFilter } from '../../types/task';

export interface FilterItem {
  id: TaskFilter;
  label: string;
  count?: number;
}

export interface TaskFilterTabsProps {
  currentFilter: TaskFilter;
  onSelectFilter: (filter: TaskFilter) => void;
  counts?: Partial<Record<TaskFilter, number>>;
}

export const TaskFilterTabs: React.FC<TaskFilterTabsProps> = ({
  currentFilter,
  onSelectFilter,
  counts,
}) => {
  const { theme } = useTheme();

  const filters: FilterItem[] = [
    { id: 'today', label: 'Today', count: counts?.today },
    { id: 'upcoming', label: 'Upcoming', count: counts?.upcoming },
    { id: 'all', label: 'All', count: counts?.all },
    { id: 'completed', label: 'Completed', count: counts?.completed },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filters.map((f) => {
          const isActive = currentFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.7}
              onPress={() => onSelectFilter(f.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
                  borderColor: isActive ? theme.colors.accent : theme.colors.borderSubtle,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${f.label} filter${f.count !== undefined ? `, ${f.count} tasks` : ''}`}
            >
              <Text
                variant="caption"
                color={isActive ? theme.colors.accentForeground : theme.colors.textSecondary}
                weight={isActive ? '700' : '500'}
              >
                {f.label}
              </Text>
              {f.count !== undefined && f.count > 0 ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isActive
                        ? 'rgba(255, 255, 255, 0.25)'
                        : theme.colors.surfaceElevated,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    color={isActive ? theme.colors.accentForeground : theme.colors.textMuted}
                    style={styles.badgeText}
                  >
                    {f.count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
