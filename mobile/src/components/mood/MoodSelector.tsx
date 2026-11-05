import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../ui/Text';
import { MoodType } from '../../types/mood';
import { MOODS } from '../../constants';

interface MoodSelectorProps {
  selectedMood?: MoodType | null;
  onSelectMood: (mood: MoodType) => void;
}

export function MoodSelector({ selectedMood, onSelectMood }: MoodSelectorProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.grid}>
      {MOODS.map((m) => {
        const moodId = m.id as MoodType;
        const isSelected = selectedMood === moodId;
        const moodColor = theme.colors.moods[m.colorKey];

        return (
          <TouchableOpacity
            key={m.id}
            activeOpacity={0.75}
            onPress={() => onSelectMood(moodId)}
            style={[
              styles.item,
              {
                backgroundColor: isSelected
                  ? theme.colors.surfaceElevated
                  : theme.colors.surfaceSubtle,
                borderColor: isSelected ? moodColor : 'transparent',
                borderWidth: isSelected ? 1.5 : 1,
              },
            ]}
          >
            <Ionicons
              name={m.icon as any}
              size={24}
              color={isSelected ? moodColor : theme.colors.textMuted}
            />
            <Text
              variant="caption"
              weight={isSelected ? '600' : '500'}
              color={isSelected ? theme.colors.textPrimary : theme.colors.textSecondary}
              style={styles.label}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  item: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
  },
});
