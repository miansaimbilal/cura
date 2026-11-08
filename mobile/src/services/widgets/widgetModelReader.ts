import * as fs from 'node:fs';
import * as path from 'node:path';
import { WidgetSnapshot } from './types';

export interface WidgetViewModel {
  isPlaceholder: boolean;
  placeholderMessage?: string;
  tasks?: {
    todayTotal: number;
    todayCompleted: number;
    overdueCount: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      dueTime: string | null;
      isTimed: boolean;
    }>;
  };
  mood?: {
    latestMoodType: string | null;
    latestLoggedAt: string | null;
  };
  quote?: {
    text: string;
    author: string;
  };
}

export const MAX_SNAPSHOT_BYTES = 1024 * 1024; // 1 MB Binder safety limit

/**
 * Pure snapshot model reader executing the exact validation, Binder limit
 * protection, and extraction logic used by CuraTasksWidget and CuraMoodWidget.
 */
export function readWidgetModelFromDir(
  snapshotsDir: string,
  expectedEpoch?: number
): WidgetViewModel {
  const defaultPlaceholder: WidgetViewModel = {
    isPlaceholder: true,
    placeholderMessage: 'Open Cura to refresh',
  };

  try {
    const manifestPath = path.join(snapshotsDir, 'current.json');
    if (!fs.existsSync(manifestPath)) {
      return defaultPlaceholder;
    }

    const stat = fs.statSync(manifestPath);
    if (stat.size > MAX_SNAPSHOT_BYTES) {
      return defaultPlaceholder;
    }

    const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    let manifest: any;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      return defaultPlaceholder;
    }

    if (!manifest || !manifest.activeFile || !manifest.userId) {
      return defaultPlaceholder;
    }

    if (expectedEpoch !== undefined && manifest.accountEpoch !== expectedEpoch) {
      return defaultPlaceholder;
    }

    const activeFilePath = path.join(snapshotsDir, manifest.activeFile);
    if (!fs.existsSync(activeFilePath)) {
      return defaultPlaceholder;
    }

    const snapshotStat = fs.statSync(activeFilePath);
    if (snapshotStat.size > MAX_SNAPSHOT_BYTES) {
      return defaultPlaceholder;
    }

    const snapshotRaw = fs.readFileSync(activeFilePath, 'utf8');
    let snapshot: WidgetSnapshot;
    try {
      snapshot = JSON.parse(snapshotRaw);
    } catch {
      return defaultPlaceholder;
    }

    if (!snapshot || !snapshot.tasks) {
      return defaultPlaceholder;
    }

    if (
      (snapshot.accountEpoch !== undefined && manifest.accountEpoch !== undefined && snapshot.accountEpoch !== manifest.accountEpoch) ||
      (snapshot.userId !== undefined && manifest.userId !== undefined && snapshot.userId !== manifest.userId)
    ) {
      return defaultPlaceholder;
    }

    // Limit to first 5 items (RemoteViews constraint)
    const todayItems = (snapshot.tasks.items || []).slice(0, 5).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      dueTime: i.dueTime,
      isTimed: Boolean(i.isTimed),
    }));

    return {
      isPlaceholder: false,
      tasks: {
        todayTotal: snapshot.tasks.todayTotal ?? 0,
        todayCompleted: snapshot.tasks.todayCompleted ?? 0,
        overdueCount: snapshot.tasks.overdueCount ?? 0,
        items: todayItems,
      },
      mood: {
        latestMoodType: snapshot.mood?.latestMoodType ?? null,
        latestLoggedAt: snapshot.mood?.latestLoggedAt ?? null,
      },
      quote: snapshot.quote
        ? { text: snapshot.quote.text, author: snapshot.quote.author }
        : undefined,
    };
  } catch {
    return defaultPlaceholder;
  }
}
