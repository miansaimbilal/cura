import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '../ui/ModalSheet';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../services/auth';
import { getDatabase } from '../../db/client';
import {
  getDatabaseStorageStats,
  exportUserDataJson,
  exportUserDataCsv,
  shareExportedData,
  vacuumDatabase,
  deleteMyData,
  DatabaseStorageStats,
} from '../../services/dataExportService';

export interface DataManagementModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DataManagementModal({ visible, onClose }: DataManagementModalProps) {
  const { theme } = useTheme();
  const { userId, logout } = useAuth();
  const [stats, setStats] = useState<DatabaseStorageStats>({
    tasksCount: 0,
    moodsCount: 0,
    conversationsCount: 0,
    messagesCount: 0,
    checkinsCount: 0,
    estimatedDbSizeBytes: 0,
  });
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isVacuuming, setIsVacuuming] = useState<boolean>(false);
  const [vacuumMessage, setVacuumMessage] = useState<string | null>(null);

  // Deletion confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteInputText, setDeleteInputText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const db = await getDatabase();
      const currentStats = await getDatabaseStorageStats(db, userId);
      setStats(currentStats);
    } catch {
      // Safe fallback
    }
  };

  useEffect(() => {
    if (visible) {
      queueMicrotask(() => {
        setVacuumMessage(null);
        setShowDeleteConfirm(false);
        setDeleteInputText('');
        setDeleteError(null);
      });
      let active = true;
      getDatabase()
        .then((db) => getDatabaseStorageStats(db, userId))
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }
  }, [visible, userId]);

  const handleExportJson = async () => {
    setIsExporting(true);
    try {
      const db = await getDatabase();
      const jsonContent = await exportUserDataJson(db, userId);
      const filename = `cura_backup_${userId}_${new Date().toISOString().slice(0, 10)}.json`;
      await shareExportedData(jsonContent, filename);
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const db = await getDatabase();
      const csvContent = await exportUserDataCsv(db, userId);
      const filename = `cura_tables_${userId}_${new Date().toISOString().slice(0, 10)}.csv`;
      await shareExportedData(csvContent, filename);
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleVacuum = async () => {
    setIsVacuuming(true);
    try {
      const db = await getDatabase();
      await vacuumDatabase(db);
      await loadStats();
      setVacuumMessage('Database defragmented and free pages reclaimed successfully.');
    } catch {
      setVacuumMessage('Vacuum completed.');
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleExecuteDelete = async () => {
    if (deleteInputText.trim() !== 'DELETE') {
      setDeleteError('Please type DELETE in capital letters to confirm.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const db = await getDatabase();
      const res = await deleteMyData(db, userId);
      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete data. Rolled back to safe state.');
        setIsDeleting(false);
        return;
      }

      // Logout and return to guest state
      await logout();
      setShowDeleteConfirm(false);
      onClose();
      Alert.alert('Data Erased', 'All your local database records, tokens, and widget caches have been permanently deleted.');
    } catch (err: any) {
      setDeleteError(err?.message || 'Deletion failed. Safe rollback applied.');
      setIsDeleting(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Data & Storage Management"
      subtitle="Inspect local SQLite database, export records, or purge data"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Storage Stats Grid */}
        <Card variant="surface" style={styles.card}>
          <View style={styles.statsHeader}>
            <Ionicons name="server-outline" size={20} color={theme.colors.accent} />
            <Text variant="body" weight="600" style={{ marginLeft: 8 }}>
              Local SQLite Database Footprint
            </Text>
          </View>
          <Text variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2, marginBottom: 12 }}>
            Estimated physical file size: <Text variant="caption" weight="600" color={theme.colors.textPrimary}>{formatSize(stats.estimatedDbSizeBytes)}</Text>
          </Text>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="heading3" color={theme.colors.accent}>
                {stats.tasksCount}
              </Text>
              <Text variant="caption" color={theme.colors.textMuted}>
                Active Tasks
              </Text>
            </View>
            <View style={[styles.metricBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="heading3" color={theme.colors.accent}>
                {stats.moodsCount}
              </Text>
              <Text variant="caption" color={theme.colors.textMuted}>
                Mood Logs
              </Text>
            </View>
            <View style={[styles.metricBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="heading3" color={theme.colors.accent}>
                {stats.messagesCount}
              </Text>
              <Text variant="caption" color={theme.colors.textMuted}>
                Chat Messages
              </Text>
            </View>
            <View style={[styles.metricBox, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Text variant="heading3" color={theme.colors.accent}>
                {stats.checkinsCount}
              </Text>
              <Text variant="caption" color={theme.colors.textMuted}>
                Check-Ins
              </Text>
            </View>
          </View>
        </Card>

        {/* Export Data Section */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Data Portability & Export
        </Text>
        <Card variant="surface" style={styles.card}>
          <Text variant="bodySmall" color={theme.colors.textSecondary} style={{ marginBottom: 12, lineHeight: 20 }}>
            Export all user-authored entries (tasks, mood history, reflections, and check-in schedules) to universal,
            open formats. No cloud connection required.
          </Text>

          <View style={styles.exportButtonsRow}>
            <Button
              title="Export JSON Backup"
              variant="primary"
              size="sm"
              loading={isExporting}
              onPress={handleExportJson}
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="document-text-outline" size={16} color={theme.colors.accentForeground} />}
            />
            <Button
              title="Export CSV Tables"
              variant="outline"
              size="sm"
              loading={isExporting}
              onPress={handleExportCsv}
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="grid-outline" size={16} color={theme.colors.accent} />}
            />
          </View>
        </Card>

        {/* Database Optimization Section */}
        <Text variant="bodySmall" weight="600" color={theme.colors.textSecondary} style={styles.sectionTitle}>
          Database Maintenance
        </Text>
        <Card variant="surface" style={styles.card}>
          <View style={styles.maintenanceRow}>
            <View style={styles.maintenanceTextCol}>
              <Text variant="body" weight="600">
                Vacuum Database
              </Text>
              <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                Cleans unused database pages and reorganizes the SQLite index tree to minimize storage footprint.
              </Text>
            </View>
            <Button
              title="Vacuum"
              variant="outline"
              size="sm"
              loading={isVacuuming}
              onPress={handleVacuum}
            />
          </View>
          {vacuumMessage && (
            <View style={[styles.feedbackBanner, { backgroundColor: theme.colors.surfaceElevated }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.success} />
              <Text variant="caption" color={theme.colors.success} style={{ marginLeft: 6 }}>
                {vacuumMessage}
              </Text>
            </View>
          )}
        </Card>

        {/* Danger Zone: Delete My Data */}
        <Text variant="bodySmall" weight="600" color={theme.colors.error} style={styles.sectionTitle}>
          Danger Zone
        </Text>
        <Card variant="surface" style={[styles.card, { borderColor: theme.colors.errorSubtle, borderWidth: 1 }]}>
          {!showDeleteConfirm ? (
            <View style={styles.dangerRow}>
              <View style={styles.maintenanceTextCol}>
                <Text variant="body" weight="600" color={theme.colors.error}>
                  Delete My Data
                </Text>
                <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                  Permanently deletes all tasks, mood logs, messages, check-ins, tokens, and widget caches. This
                  action is irreversible.
                </Text>
              </View>
              <Button
                title="Delete"
                variant="danger"
                size="sm"
                onPress={() => setShowDeleteConfirm(true)}
              />
            </View>
          ) : (
            <View style={styles.confirmDeleteContainer}>
              <View style={styles.confirmHeader}>
                <Ionicons name="warning" size={20} color={theme.colors.error} />
                <Text variant="bodySmall" weight="700" color={theme.colors.error} style={{ marginLeft: 6 }}>
                  Type &quot;DELETE&quot; to Confirm Permanent Erasure
                </Text>
              </View>
              <Text variant="caption" color={theme.colors.textSecondary} style={{ marginVertical: 6 }}>
                To avoid accidental deletion, please type DELETE below. All local SQLite tables for this user will be
                wiped immediately.
              </Text>

              <TextInput
                value={deleteInputText}
                onChangeText={setDeleteInputText}
                placeholder="DELETE"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="characters"
                style={[
                  styles.deleteInput,
                  {
                    backgroundColor: theme.colors.surfaceElevated,
                    color: theme.colors.textPrimary,
                    borderColor: theme.colors.border,
                  },
                ]}
              />

              {deleteError && (
                <Text variant="caption" color={theme.colors.error} style={{ marginVertical: 4 }}>
                  {deleteError}
                </Text>
              )}

              <View style={styles.confirmButtonsRow}>
                <Button
                  title="Cancel"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setShowDeleteConfirm(false);
                    setDeleteInputText('');
                    setDeleteError(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Confirm Delete"
                  variant="danger"
                  size="sm"
                  loading={isDeleting}
                  disabled={deleteInputText.trim() !== 'DELETE'}
                  onPress={handleExecuteDelete}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
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
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 6,
    marginLeft: 4,
  },
  exportButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  maintenanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  maintenanceTextCol: {
    flex: 1,
    marginRight: 10,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confirmDeleteContainer: {
    paddingTop: 4,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    marginVertical: 8,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
