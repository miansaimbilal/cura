import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Divider } from '../ui/Divider';
import { useTheme } from '../../hooks/useTheme';
import {
  getAISettings,
  saveAISettings,
  fetchAIProviderStatus,
  AISettings,
  DEFAULT_AI_SETTINGS,
  PROVIDER_CATALOG,
  ProviderHealthSummary,
} from '../../services/aiSettingsService';

export interface AISettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AISettingsModal({ visible, onClose }: AISettingsModalProps) {
  const { theme } = useTheme();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [providers, setProviders] = useState<ProviderHealthSummary[]>([]);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);

  useEffect(() => {
    if (visible) {
      getAISettings().then(setSettings);
      fetchAIProviderStatus().then((res) => {
        setIsBackendOnline(res.isOnline);
        setProviders(res.providers);
      });
    }
  }, [visible]);

  const selectProvider = async (providerId: keyof typeof PROVIDER_CATALOG) => {
    const catalogEntry = PROVIDER_CATALOG[providerId];
    const newSettings: AISettings = {
      ...settings,
      selectedProvider: providerId as any,
      selectedModel: catalogEntry.defaultModel,
    };
    await saveAISettings(newSettings);
    setSettings(newSettings);
  };

  const selectModel = async (model: string) => {
    const newSettings: AISettings = {
      ...settings,
      selectedModel: model,
    };
    await saveAISettings(newSettings);
    setSettings(newSettings);
  };

  const currentCatalog = PROVIDER_CATALOG[settings.selectedProvider] || PROVIDER_CATALOG.gemini;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="AI Provider Settings"
      subtitle="Interactive companion provider, model & background failover"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Backend Connection Status Banner */}
        <View
          style={[
            styles.statusBanner,
            { backgroundColor: isBackendOnline ? theme.colors.successSubtle : theme.colors.surfaceElevated },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isBackendOnline ? theme.colors.success : theme.colors.textMuted },
            ]}
          />
          <Text
            variant="caption"
            weight="600"
            color={isBackendOnline ? theme.colors.success : theme.colors.textSecondary}
          >
            {isBackendOnline ? 'AI Backend Router Online' : 'Local Offline Mode (Cached Settings)'}
          </Text>
        </View>

        {/* 1. Chat Provider Selection */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Primary Interactive Chat Provider
        </Text>
        <Card variant="surface" style={styles.card}>
          {Object.entries(PROVIDER_CATALOG).map(([pId, info], idx) => {
            const isSelected = settings.selectedProvider === pId;
            const health = providers.find((p) => p.id === pId);
            const isConfigured = health?.status !== 'unconfigured';

            return (
              <React.Fragment key={pId}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => selectProvider(pId as any)}
                  style={styles.providerRow}
                >
                  <View style={styles.providerLeft}>
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isSelected ? theme.colors.accent : theme.colors.borderStrong}
                    />
                    <View style={styles.providerDetails}>
                      <Text variant="body" weight={isSelected ? '600' : '500'}>
                        {info.name}
                      </Text>
                      <Text variant="caption" color={theme.colors.textMuted}>
                        Default: {info.defaultModel}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isConfigured ? theme.colors.surfaceSubtle : theme.colors.warningSubtle,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      weight="600"
                      color={isConfigured ? theme.colors.textSecondary : theme.colors.warning}
                    >
                      {isConfigured ? 'Ready' : 'Not Configured'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {idx < Object.keys(PROVIDER_CATALOG).length - 1 && <Divider style={{ marginVertical: 8 }} />}
              </React.Fragment>
            );
          })}
        </Card>

        {/* 2. Model Selection for Chosen Provider */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Active Model ({currentCatalog.name})
        </Text>
        <Card variant="surface" style={styles.card}>
          <View style={styles.modelGrid}>
            {currentCatalog.availableModels.map((m) => {
              const isSelected = settings.selectedModel === m;
              return (
                <TouchableOpacity
                  key={m}
                  activeOpacity={0.7}
                  onPress={() => selectModel(m)}
                  style={[
                    styles.modelPill,
                    {
                      backgroundColor: isSelected ? theme.colors.accent : theme.colors.surfaceElevated,
                      borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={isSelected ? theme.colors.accentForeground : theme.colors.textSecondary}
                  />
                  <Text
                    variant="caption"
                    weight={isSelected ? '600' : '500'}
                    color={isSelected ? theme.colors.accentForeground : theme.colors.textPrimary}
                    style={{ marginLeft: 6 }}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* 3. Background Provider Priority */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Background AI Failover Priority (Analytics & Insights)
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="caption" color={theme.colors.textMuted} style={{ marginBottom: 10 }}>
            If the primary provider experiences rate limits or timeouts, background operations fail over down this
            ordered sequence:
          </Text>
          <View style={styles.failoverRow}>
            {settings.backgroundPriority.map((pId, idx) => (
              <React.Fragment key={pId}>
                <View style={[styles.priorityPill, { backgroundColor: theme.colors.surfaceElevated }]}>
                  <Text variant="caption" weight="600" color={theme.colors.accent}>
                    {idx + 1}. {pId}
                  </Text>
                </View>
                {idx < settings.backgroundPriority.length - 1 && (
                  <Ionicons name="arrow-forward" size={14} color={theme.colors.textMuted} style={{ marginHorizontal: 4 }} />
                )}
              </React.Fragment>
            ))}
          </View>
        </Card>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  sectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    marginBottom: 16,
    padding: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  providerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  providerDetails: {
    marginLeft: 10,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modelGrid: {
    flexDirection: 'column',
    gap: 8,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  failoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
});
