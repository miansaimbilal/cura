import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { useTheme } from '../../hooks/useTheme';

export interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ visible, onClose }: PrivacyPolicyModalProps) {
  const { theme } = useTheme();

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Privacy & Data Explanations"
      subtitle="Honest and transparent accounting of how your data is handled"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Core Principles Card */}
        <Card variant="surface" style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accent} />
            <Text variant="body" weight="600" style={{ marginLeft: 8 }}>
              Offline-First & Local Sovereignty
            </Text>
          </View>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ marginTop: 6, lineHeight: 20 }}>
            Cura is architected from the ground up as an offline-first companion. Your personal entries live directly on
            your device in a local SQLite database and are completely functional without an internet connection.
          </Text>
        </Card>

        {/* 1. What is stored locally */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          1. What Information is Stored Locally
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ lineHeight: 20 }}>
            Stored exclusively in your device&apos;s private SQLite storage:{'\n'}
            • <Text variant="bodySmall" weight="600">Tasks & Checklists:</Text> Titles, descriptions, due dates, and completion status.{'\n'}
            • <Text variant="bodySmall" weight="600">Mood Tracking:</Text> Categorical mood entries, timestamps, user notes, and emotional tags.{'\n'}
            • <Text variant="bodySmall" weight="600">Conversations:</Text> Reflection messages and chat history with timestamps.{'\n'}
            • <Text variant="bodySmall" weight="600">Preferences:</Text> Notification schedules, quiet hours, and theme choices.
          </Text>
        </Card>

        {/* 2. What is sent to AI providers */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          2. What Information is Sent to AI Providers
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ lineHeight: 20 }}>
            Cura <Text variant="bodySmall" weight="600" color={theme.colors.textPrimary}>NEVER</Text> transmits your entire database. When you send a message or request a reflection, only a strictly bounded context package is sent:{'\n'}
            • The message you just typed.{'\n'}
            • The active chat thread&apos;s recent turns.{'\n'}
            • Today&apos;s task list (so the AI can provide relevant support).{'\n'}
            • Mood tags from the last 3 days (to understand your recent state of mind).{'\n'}
            {'\n'}
            Historical conversations from past days and unassociated records are omitted.
          </Text>
        </Card>

        {/* 3. Which provider receives a request */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          3. Which AI Provider Receives Requests
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ lineHeight: 20 }}>
            • <Text variant="bodySmall" weight="600">Interactive Chat:</Text> Sent only to your selected provider (e.g. Google Gemini or Groq). It is never routed to another provider mid-chat.{'\n'}
            • <Text variant="bodySmall" weight="600">Background Failover:</Text> If a provider times out during background summary generation, the system tries configured providers in priority order.{'\n'}
            • <Text variant="bodySmall" weight="600">Third-Party Logs Notice:</Text> Requests sent to third-party AI APIs are processed under the respective provider&apos;s developer terms. While commercial API tiers contractually exclude data from training, Cura cannot verify deletion from third-party server logs and does not make unverified claims of third-party erasure.
          </Text>
        </Card>

        {/* 4. Export & Deletion */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          4. How to Export or Delete Your Data
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ lineHeight: 20 }}>
            • <Text variant="bodySmall" weight="600">Data Export:</Text> You can generate complete, portable JSON and CSV files of all your entries directly from Settings → Data & Storage.{'\n'}
            • <Text variant="bodySmall" weight="600">Delete My Data:</Text> You can permanently erase all local SQLite database records, secure auth tokens, and widget caches at any time. The deletion is atomic and irreversible.
          </Text>
        </Card>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    marginBottom: 16,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 6,
    marginLeft: 4,
  },
});
