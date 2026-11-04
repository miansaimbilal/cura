import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { MOODS } from '../../src/constants';

export default function MoodScreen() {
  const { theme } = useTheme();
  const [highlightedMoodId, setHighlightedMoodId] = useState('calm');

  return (
    <ScreenContainer
      header={
        <Header
          title="Mood Tracking"
          subtitle="Design-system preview (Phase 4 feature)"
        />
      }
    >
      {/* Mood Palette Visual Preview Card */}
      <Card variant="surface" style={styles.selectorCard}>
        <Text variant="heading3" style={{ marginBottom: 4 }}>
          Mood Palette (Design Preview)
        </Text>
        <Text variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: 14 }}>
          Visual demonstration of non-judgmental mood palette tokens and responsive grid layout. Tap to inspect palette colors.
        </Text>

        <View style={styles.moodGrid}>
          {MOODS.map((m) => {
            const isHighlighted = highlightedMoodId === m.id;
            const moodColor = theme.colors.moods[m.colorKey];
            return (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.75}
                onPress={() => setHighlightedMoodId(m.id)}
                style={[
                  styles.gridItem,
                  {
                    backgroundColor: isHighlighted ? theme.colors.surfaceElevated : theme.colors.surfaceSubtle,
                    borderColor: isHighlighted ? moodColor : 'transparent',
                    borderWidth: isHighlighted ? 1.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={m.icon as any}
                  size={24}
                  color={isHighlighted ? moodColor : theme.colors.textMuted}
                />
                <Text
                  variant="caption"
                  color={isHighlighted ? theme.colors.textPrimary : theme.colors.textSecondary}
                  style={styles.gridLabel}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Mood History Timeline Section (Sample Demonstration Content) */}
      <SectionHeader
        title="Sample Reflections"
        subtitle="Chronological timeline component demonstration"
      />

      <View style={styles.historyList}>
        {/* Sample Entry 1 */}
        <Card variant="surface" style={styles.historyCard}>
          <View style={styles.historyRow}>
            <View style={[styles.moodBadge, { backgroundColor: theme.colors.moods.calm }]}>
              <Ionicons name="leaf" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.historyTextCol}>
              <View style={styles.historyTopLine}>
                <Text variant="subheading" weight="600">
                  Sample: Calm (2:15 PM)
                </Text>
                <Text variant="caption" color={theme.colors.textMuted}>
                  Sample Entry
                </Text>
              </View>
              <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                Demonstration card showing note text formatting and layout.
              </Text>
              <View style={styles.tagRow}>
                <View style={[styles.tagPill, { backgroundColor: theme.colors.surfaceElevated }]}>
                  <Text variant="caption" color={theme.colors.textMuted}>
                    #walk
                  </Text>
                </View>
                <View style={[styles.tagPill, { backgroundColor: theme.colors.surfaceElevated }]}>
                  <Text variant="caption" color={theme.colors.textMuted}>
                    #break
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Sample Entry 2 */}
        <Card variant="surface" style={styles.historyCard}>
          <View style={styles.historyRow}>
            <View style={[styles.moodBadge, { backgroundColor: theme.colors.moods.happy }]}>
              <Ionicons name="sunny" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.historyTextCol}>
              <View style={styles.historyTopLine}>
                <Text variant="subheading" weight="600">
                  Sample: Content (Yesterday)
                </Text>
                <Text variant="caption" color={theme.colors.textMuted}>
                  Sample Entry
                </Text>
              </View>
              <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                Demonstration card showing multi-day mood timeline hierarchy.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Scope Disclaimer */}
      <View style={[styles.noteBox, { backgroundColor: theme.colors.surfaceSubtle }]}>
        <Text variant="caption" color={theme.colors.textMuted} align="center">
          Phase 1 layout preview. Actual mood logging, note processing, local persistence, and analytics belong to Phase 4.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  selectorCard: {
    marginBottom: 20,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  gridItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  gridLabel: {
    marginTop: 6,
    fontWeight: '500',
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    marginBottom: 0,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  moodBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyTextCol: {
    flex: 1,
  },
  historyTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  noteBox: {
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
  },
});
