import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { LoadingIndicator } from '../../src/components/ui/LoadingIndicator';
import { useTheme } from '../../src/hooks/useTheme';
import { useTasks } from '../../src/hooks/useTasks';
import { Task, CreateTaskInput, UpdateTaskInput } from '../../src/types/task';
import {
  TaskCard,
  TaskFormModal,
  TaskDetailModal,
  TaskFilterTabs,
} from '../../src/components/tasks';

export default function TasksScreen() {
  const { theme } = useTheme();
  const {
    tasks,
    filteredTasks,
    currentFilter,
    setFilter,
    todaySummary,
    isLoading,
    error,
    createTask,
    updateTask,
    toggleComplete,
    postponeTask,
    cancelTask,
    deleteTask,
    refreshTasks,
  } = useTasks();

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshTasks();
    setIsRefreshing(false);
  };

  const handleOpenCreate = () => {
    setEditingTask(null);
    setIsFormVisible(true);
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setIsFormVisible(true);
  };

  const handleSaveTask = async (data: CreateTaskInput | UpdateTaskInput) => {
    if (editingTask) {
      await updateTask(editingTask.id, data);
    } else {
      await createTask(data as CreateTaskInput);
    }
  };

  // Compute filter badge counts
  const filterCounts = {
    today: todaySummary.total,
    upcoming: tasks.filter((t) => t.dueDate && t.status === 'pending').length,
    all: tasks.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  // Render contextual empty states based on filter
  const renderEmptyState = () => {
    switch (currentFilter) {
      case 'today':
        return (
          <EmptyState
            title="All clear for today"
            description="You have no pending tasks scheduled for today. Take time to relax or add something you'd like to do."
            icon={<Ionicons name="sunny-outline" size={36} color={theme.colors.warning} />}
            actionTitle="Add a Task"
            onAction={handleOpenCreate}
          />
        );
      case 'upcoming':
        return (
          <EmptyState
            title="No upcoming tasks"
            description="You don't have any scheduled tasks for the coming days. You're completely caught up!"
            icon={<Ionicons name="calendar-outline" size={36} color={theme.colors.accent} />}
            actionTitle="Schedule a Task"
            onAction={handleOpenCreate}
          />
        );
      case 'completed':
        return (
          <EmptyState
            title="No completed tasks yet"
            description="As you check off tasks, they will appear here in your accomplishment history."
            icon={<Ionicons name="checkmark-done-circle-outline" size={36} color={theme.colors.success} />}
          />
        );
      case 'all':
      default:
        return (
          <EmptyState
            title="No tasks yet"
            description="Cura keeps your tasks safe locally on your device. Create your first task to get started."
            icon={<Ionicons name="checkbox-outline" size={36} color={theme.colors.accent} />}
            actionTitle="Create First Task"
            onAction={handleOpenCreate}
          />
        );
    }
  };

  if (isLoading && tasks.length === 0) {
    return (
      <ScreenContainer
        header={<Header title="Tasks" subtitle="Loading your tasks..." />}
      >
        <View style={styles.loadingContainer}>
          <LoadingIndicator label="Initializing local SQLite database..." />
        </View>
      </ScreenContainer>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <ScreenContainer
        header={<Header title="Tasks" subtitle="Error loading tasks" />}
      >
        <Card variant="surface" style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={32} color={theme.colors.error} />
          <Text variant="subheading" color={theme.colors.error} style={styles.errorTitle}>
            Database Error
          </Text>
          <Text variant="bodySmall" color={theme.colors.textSecondary} align="center">
            {error}
          </Text>
          <Button
            title="Retry"
            variant="primary"
            onPress={handleRefresh}
            style={styles.retryButton}
          />
        </Card>
      </ScreenContainer>
    );
  }

  const headerSubtitle =
    todaySummary.total > 0
      ? `${todaySummary.completed} of ${todaySummary.total} completed today`
      : 'Local-first task companion';

  return (
    <ScreenContainer
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
      header={
        <Header
          title="Tasks"
          subtitle={headerSubtitle}
          rightElement={
            <Button
              title="Add Task"
              size="sm"
              variant="primary"
              leftIcon={<Ionicons name="add" size={16} color={theme.colors.accentForeground} />}
              onPress={handleOpenCreate}
            />
          }
        />
      }
    >
      {/* Dynamic Filter Tabs with Task Counts */}
      <TaskFilterTabs
        currentFilter={currentFilter}
        onSelectFilter={setFilter}
        counts={filterCounts}
      />

      {/* Task List or Empty State */}
      {filteredTasks.length === 0 ? (
        <Card variant="surface" style={styles.emptyContainer}>
          {renderEmptyState()}
        </Card>
      ) : (
        <View style={styles.taskList}>
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggleComplete={toggleComplete}
              onPress={(t) => setSelectedTask(t)}
              showDate={currentFilter === 'all' || currentFilter === 'upcoming'}
            />
          ))}
        </View>
      )}

      {/* Task Creation & Editing Modal Sheet */}
      <TaskFormModal
        visible={isFormVisible}
        onClose={() => {
          setIsFormVisible(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        initialTask={editingTask}
      />

      {/* Task Detail & Actions Modal Sheet */}
      <TaskDetailModal
        task={selectedTask}
        visible={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        onEdit={handleOpenEdit}
        onToggleComplete={async (id) => {
          await toggleComplete(id);
        }}
        onPostpone={async (id, newDate, newTime) => {
          await postponeTask(id, newDate, newTime);
        }}
        onCancel={async (id) => {
          await cancelTask(id);
        }}
        onDelete={async (id) => {
          await deleteTask(id);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  errorTitle: {
    marginTop: 8,
    marginBottom: 4,
  },
  retryButton: {
    marginTop: 16,
  },
  emptyContainer: {
    paddingVertical: 12,
  },
  taskList: {
    paddingBottom: 24,
  },
});
