import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { useMood } from '../../src/hooks/useMood';
import { MoodType, MoodEntry, CreateMoodInput, UpdateMoodInput } from '../../src/types/mood';
import { MoodSelector } from '../../src/components/mood/MoodSelector';
import { MoodLogModal } from '../../src/components/mood/MoodLogModal';
import { MoodCard } from '../../src/components/mood/MoodCard';
import { DayMoodTimeline } from '../../src/components/mood/DayMoodTimeline';

export default function MoodScreen() {
  const { theme } = useTheme();
  const { moodEntries, todayMoods, createMood, updateMood, deleteMood } = useMood();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInitialMood, setSelectedInitialMood] = useState<MoodType | null>('calm');
  const [entryToEdit, setEntryToEdit] = useState<MoodEntry | null>(null);

  const handleOpenQuickLog = (mood: MoodType) => {
    setSelectedInitialMood(mood);
    setEntryToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenAddCustom = () => {
    setSelectedInitialMood('calm');
    setEntryToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: MoodEntry) => {
    setEntryToEdit(entry);
    setSelectedInitialMood(entry.moodType);
    setIsModalOpen(true);
  };

  const handleSaveMood = async (data: CreateMoodInput | UpdateMoodInput) => {
    if (entryToEdit) {
      await updateMood(entryToEdit.id, data as UpdateMoodInput);
    } else {
      await createMood(data as CreateMoodInput);
    }
  };

  const handleDeleteMood = async (id: string) => {
    await deleteMood(id);
  };

  return (
    <ScreenContainer
      header={
        <Header
          title="Mood Tracking"
          subtitle="Check in with yourself and reflect"
        />
      }
    >
      {/* Quick Mood Selection Palette */}
      <Card variant="surface" style={styles.selectorCard}>
        <View style={styles.selectorHeader}>
          <View>
            <Text variant="heading3">How are you feeling?</Text>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
              Tap a mood to log an instant reflection
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <MoodSelector onSelectMood={handleOpenQuickLog} />
        </View>
      </Card>

      {/* Today's Emotional Trajectory */}
      <SectionHeader
        title="Today's Reflections"
        subtitle={todayMoods.length > 0 ? `${todayMoods.length} logged today` : 'No logs yet today'}
        actionText="+ Log"
        onActionPress={handleOpenAddCustom}
      />

      <DayMoodTimeline
        entries={todayMoods}
        onSelectEntry={handleOpenEdit}
      />

      {/* Chronological History */}
      <SectionHeader
        title="Mood History"
        subtitle="Chronological log of all past reflections"
      />

      {moodEntries.length === 0 ? (
        <Card variant="surface" style={styles.emptyHistoryCard}>
          <Text variant="subheading" weight="600">
            No entries recorded yet
          </Text>
          <Text variant="caption" color={theme.colors.textMuted} style={styles.emptyHistoryText}>
            Your mood reflections and journal notes will be preserved here offline.
          </Text>
          <Button
            title="Log Your First Mood"
            variant="primary"
            size="sm"
            onPress={handleOpenAddCustom}
            style={{ marginTop: 12 }}
          />
        </Card>
      ) : (
        <View style={styles.historyList}>
          {moodEntries.map((entry) => (
            <MoodCard
              key={entry.id}
              entry={entry}
              onEdit={handleOpenEdit}
              onDelete={handleDeleteMood}
            />
          ))}
        </View>
      )}

      {/* Mood Log / Edit Modal */}
      <MoodLogModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveMood}
        initialEntry={entryToEdit}
        initialMood={selectedInitialMood}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  selectorCard: {
    padding: 16,
    marginBottom: 16,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyList: {
    marginTop: 4,
    marginBottom: 24,
  },
  emptyHistoryCard: {
    alignItems: 'center',
    padding: 24,
    marginVertical: 12,
  },
  emptyHistoryText: {
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
});
