import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { MoodType, MoodEntry, CreateMoodInput, UpdateMoodInput } from '../../types/mood';
import { MOODS } from '../../constants';

interface MoodLogModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: CreateMoodInput | UpdateMoodInput) => Promise<void>;
  initialEntry?: MoodEntry | null;
  initialMood?: MoodType | null;
}

const TAG_PRESETS = [
  'work',
  'rest',
  'social',
  'health',
  'family',
  'exercise',
  'study',
  'nature',
  'sleep',
];

interface MoodLogFormProps {
  initialEntry?: MoodEntry | null;
  initialMood?: MoodType | null;
  onClose: () => void;
  onSave: (data: CreateMoodInput | UpdateMoodInput) => Promise<void>;
}

function MoodLogForm({
  initialEntry,
  initialMood,
  onClose,
  onSave,
}: MoodLogFormProps) {
  const { theme } = useTheme();

  const [selectedMood, setSelectedMood] = useState<MoodType>(
    initialEntry ? initialEntry.moodType : initialMood || 'calm'
  );
  const [note, setNote] = useState<string>(initialEntry?.note || '');
  const [tags, setTags] = useState<string[]>(initialEntry?.tags || []);
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((t) => t !== tag));
    } else {
      if (tags.length >= 10) {
        setErrorMsg('Maximum 10 tags allowed');
        return;
      }
      setTags([...tags, tag]);
    }
  };

  const handleAddCustomTag = () => {
    const clean = customTagInput.trim().replace(/^#+/, '').toLowerCase();
    if (!clean) return;
    if (clean.length > 30) {
      setErrorMsg('Tag length cannot exceed 30 characters');
      return;
    }
    if (tags.includes(clean)) {
      setCustomTagInput('');
      return;
    }
    if (tags.length >= 10) {
      setErrorMsg('Maximum 10 tags allowed');
      return;
    }
    setTags([...tags, clean]);
    setCustomTagInput('');
    setErrorMsg(null);
  };

  const handleSave = async () => {
    if (note.length > 1000) {
      setErrorMsg('Note cannot exceed 1000 characters');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSave({
        moodType: selectedMood,
        note: note.trim() || null,
        tags,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save reflection');
    } finally {
      setIsSaving(false);
    }
  };

  const activeMoodDef = MOODS.find((m) => m.id === selectedMood);
  const activeColor = activeMoodDef ? theme.colors.moods[activeMoodDef.colorKey] : theme.colors.accent;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Mood Selection Palette */}
      <Text variant="caption" color={theme.colors.textMuted} style={styles.sectionLabel}>
        SELECT MOOD
      </Text>
      <View style={styles.moodGrid}>
        {MOODS.map((m) => {
          const isSelected = selectedMood === m.id;
          const moodColor = theme.colors.moods[m.colorKey];
          return (
            <TouchableOpacity
              key={m.id}
              activeOpacity={0.7}
              onPress={() => setSelectedMood(m.id as MoodType)}
              style={[
                styles.moodTile,
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
                size={22}
                color={isSelected ? moodColor : theme.colors.textMuted}
              />
              <Text
                variant="caption"
                weight={isSelected ? '600' : '400'}
                color={isSelected ? theme.colors.textPrimary : theme.colors.textSecondary}
                style={styles.moodLabel}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Reflection Note Input */}
      <Text variant="caption" color={theme.colors.textMuted} style={styles.sectionLabel}>
        REFLECTION (OPTIONAL)
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What's on your mind? What led to this feeling?"
        placeholderTextColor={theme.colors.textMuted}
        multiline
        numberOfLines={3}
        maxLength={1000}
        style={[
          styles.noteInput,
          {
            backgroundColor: theme.colors.surfaceSubtle,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.borderSubtle,
          },
        ]}
      />
      <View style={styles.charCountRow}>
        <Text variant="caption" color={theme.colors.textMuted}>
          {note.length} / 1000
        </Text>
      </View>

      {/* Tags Presets */}
      <Text variant="caption" color={theme.colors.textMuted} style={styles.sectionLabel}>
        TAGS & CONTEXT
      </Text>
      <View style={styles.tagChipsRow}>
        {TAG_PRESETS.map((preset) => {
          const isSelected = tags.includes(preset);
          return (
            <TouchableOpacity
              key={preset}
              activeOpacity={0.7}
              onPress={() => toggleTag(preset)}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected
                    ? activeColor
                    : theme.colors.surfaceSubtle,
                  borderColor: isSelected ? activeColor : theme.colors.borderSubtle,
                },
              ]}
            >
              <Text
                variant="caption"
                weight={isSelected ? '600' : '500'}
                color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
              >
                #{preset}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Custom Tag Input */}
      <View style={styles.customTagRow}>
        <TextInput
          value={customTagInput}
          onChangeText={setCustomTagInput}
          placeholder="Add custom tag..."
          placeholderTextColor={theme.colors.textMuted}
          onSubmitEditing={handleAddCustomTag}
          returnKeyType="done"
          style={[
            styles.customTagInput,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.borderSubtle,
            },
          ]}
        />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleAddCustomTag}
          style={[styles.addTagButton, { backgroundColor: theme.colors.surfaceElevated }]}
        >
          <Ionicons name="add" size={18} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Selected Custom Tags */}
      {tags.filter((t) => !TAG_PRESETS.includes(t)).length > 0 && (
        <View style={styles.customTagsList}>
          {tags
            .filter((t) => !TAG_PRESETS.includes(t))
            .map((t) => (
              <View
                key={t}
                style={[styles.customTagPill, { backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Text variant="caption" color={theme.colors.textPrimary}>
                  #{t}
                </Text>
                <TouchableOpacity onPress={() => toggleTag(t)} style={{ marginLeft: 4 }}>
                  <Ionicons name="close" size={14} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
        </View>
      )}

      {/* Error message */}
      {errorMsg ? (
        <Text variant="caption" color={theme.colors.error} style={styles.errorText}>
          {errorMsg}
        </Text>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.btnRow}>
        <Button
          title="Cancel"
          variant="ghost"
          onPress={onClose}
          style={styles.cancelBtn}
        />
        <Button
          title={initialEntry ? 'Save Changes' : 'Record Reflection'}
          variant="primary"
          loading={isSaving}
          onPress={handleSave}
          style={styles.saveBtn}
        />
      </View>
    </ScrollView>
  );
}

export function MoodLogModal({
  visible,
  onClose,
  onSave,
  initialEntry,
  initialMood = 'calm',
}: MoodLogModalProps) {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={initialEntry ? 'Edit Reflection' : 'How are you feeling?'}
      subtitle={initialEntry ? 'Update your recorded reflection' : 'Select your mood and add optional thoughts'}
    >
      <MoodLogForm
        key={initialEntry ? `edit-${initialEntry.id}` : `new-${initialMood || 'calm'}`}
        initialEntry={initialEntry}
        initialMood={initialMood}
        onClose={onClose}
        onSave={onSave}
      />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  moodTile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  moodLabel: {
    marginTop: 4,
    fontSize: 11,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  charCountRow: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  tagChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  customTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  customTagInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  addTagButton: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  customTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  errorText: {
    marginTop: 10,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    minWidth: 80,
  },
  saveBtn: {
    minWidth: 140,
  },
});
