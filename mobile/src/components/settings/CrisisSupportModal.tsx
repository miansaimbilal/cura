import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Divider';
import { useTheme } from '../../hooks/useTheme';
import {
  getCrisisDirectory,
  triggerCrisisContact,
  CRISIS_DIRECTORIES,
  CRISIS_DISCLAIMER_TEXT,
  TRUSTED_PERSON_PROMPT,
  CrisisHelpline,
} from '../../services/crisisSupportService';

export interface CrisisSupportModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CrisisSupportModal({ visible, onClose }: CrisisSupportModalProps) {
  const { theme } = useTheme();
  const [selectedCountry, setSelectedCountry] = useState<string>('PK');

  const directory = getCrisisDirectory(selectedCountry);

  const countryTabs: { code: string; label: string }[] = [
    { code: 'PK', label: 'Pakistan' },
    { code: 'US', label: 'United States' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'INT', label: 'International' },
  ];

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Support & Crisis Directory"
      subtitle="Verified emergency, mental health, and counseling resources"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Trusted Person Prompt Card */}
        <Card variant="surface" style={[styles.card, { borderColor: theme.colors.accent, borderWidth: 1 }]}>
          <View style={styles.promptHeader}>
            <Ionicons name="heart-outline" size={20} color={theme.colors.accent} />
            <Text variant="body" weight="600" color={theme.colors.accent} style={{ marginLeft: 8 }}>
              You Are Not Alone
            </Text>
          </View>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ marginTop: 6, lineHeight: 20 }}>
            {TRUSTED_PERSON_PROMPT}
          </Text>
        </Card>

        {/* Country Selector Tabs */}
        <View style={styles.countryTabsRow}>
          {countryTabs.map((tab) => {
            const isSelected = selectedCountry === tab.code;
            return (
              <TouchableOpacity
                key={tab.code}
                activeOpacity={0.7}
                onPress={() => setSelectedCountry(tab.code)}
                style={[
                  styles.countryTabPill,
                  {
                    backgroundColor: isSelected ? theme.colors.accent : theme.colors.surfaceElevated,
                    borderColor: isSelected ? theme.colors.accent : theme.colors.borderSubtle,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  weight={isSelected ? '600' : '500'}
                  color={isSelected ? theme.colors.accentForeground : theme.colors.textSecondary}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Primary Emergency Banner for Selected Country */}
        <Card variant="surface" style={[styles.emergencyBanner, { backgroundColor: theme.colors.errorSubtle }]}>
          <View style={styles.emergencyRow}>
            <Ionicons name="call" size={22} color={theme.colors.error} />
            <View style={styles.emergencyTextCol}>
              <Text variant="bodySmall" weight="700" color={theme.colors.error}>
                Immediate Emergency Assistance ({directory.countryName}): {directory.emergencyNumber}
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary}>
                Call for ambulance, medical emergency rescue, or immediate life safety.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                triggerCrisisContact({
                  id: 'primary_emergency',
                  name: 'Emergency',
                  serviceType: 'emergency',
                  contact: directory.emergencyNumber,
                  contactType: 'phone',
                  description: '',
                  hours: '24/7',
                  availableLocation: directory.countryName,
                })
              }
              style={[styles.callPill, { backgroundColor: theme.colors.error }]}
            >
              <Text variant="caption" weight="700" color={theme.colors.accentForeground}>
                CALL {directory.emergencyNumber}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Directory List */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Verified Crisis Helplines & Support Networks
        </Text>
        <Card variant="surface" style={styles.card}>
          {directory.helplines.map((helpline: CrisisHelpline, idx: number) => {
            const isPhone = helpline.contactType === 'phone';
            const isText = helpline.contactType === 'text';

            return (
              <React.Fragment key={helpline.id}>
                <View style={styles.helplineRow}>
                  <View style={styles.helplineDetails}>
                    <View style={styles.titleBadgeRow}>
                      <Text variant="body" weight="600">
                        {helpline.name}
                      </Text>
                      <View style={[styles.typeBadge, { backgroundColor: theme.colors.surfaceSubtle }]}>
                        <Text variant="caption" weight="600" color={theme.colors.accent}>
                          {helpline.serviceType.replace('_', ' ')}
                        </Text>
                      </View>
                    </View>
                    <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                      {helpline.description}
                    </Text>
                    <View style={styles.hoursRow}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                      <Text variant="caption" color={theme.colors.textMuted} style={{ marginLeft: 4 }}>
                        {helpline.hours} • {helpline.availableLocation}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => triggerCrisisContact(helpline)}
                    style={[styles.actionButton, { backgroundColor: theme.colors.surfaceElevated }]}
                  >
                    <Ionicons
                      name={isPhone ? 'call-outline' : isText ? 'chatbubble-ellipses-outline' : 'open-outline'}
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text variant="caption" weight="600" color={theme.colors.accent} style={{ marginLeft: 4 }}>
                      {isPhone ? 'Call' : isText ? 'Text' : 'Visit'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {idx < directory.helplines.length - 1 && <Divider style={{ marginVertical: 10 }} />}
              </React.Fragment>
            );
          })}
        </Card>

        {/* Regulatory & Safety Disclaimer */}
        <View style={[styles.disclaimerBox, { backgroundColor: theme.colors.surfaceElevated }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.textMuted} />
          <Text variant="caption" color={theme.colors.textMuted} style={styles.disclaimerText}>
            {CRISIS_DISCLAIMER_TEXT}
          </Text>
        </View>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    marginBottom: 14,
    padding: 14,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  countryTabPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emergencyBanner: {
    marginBottom: 14,
    padding: 12,
  },
  emergencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyTextCol: {
    flex: 1,
    marginHorizontal: 8,
  },
  callPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
  },
  helplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helplineDetails: {
    flex: 1,
    marginRight: 10,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginTop: 6,
  },
  disclaimerText: {
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});
