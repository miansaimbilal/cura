import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readWidgetModelFromDir } from '../../../src/services/widgets/widgetModelReader';
import { WidgetSnapshot } from '../../../src/services/widgets/types';

describe('iOS WidgetKit UI Data Model Tests', () => {
  let appGroupDir: string;

  beforeEach(() => {
    // Simulates iOS App Group container (<AppGroup>/snapshots/)
    appGroupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cura-ios-appgroup-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(appGroupDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  function writeManifest(manifest: any) {
    fs.writeFileSync(path.join(appGroupDir, 'current.json'), JSON.stringify(manifest), 'utf8');
  }

  function writeSnapshot(filename: string, snapshot: any) {
    fs.writeFileSync(path.join(appGroupDir, filename), JSON.stringify(snapshot), 'utf8');
  }

  it('Valid -> correct todayTotal, items, mood, quote', () => {
    const activeFile = 'snapshot_usr_ios_1_1_valid.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_ios_1',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    const mockSnapshot: Partial<WidgetSnapshot> = {
      schemaVersion: 1,
      revision: 1,
      sourceRevision: 1,
      userId: 'usr_ios_1',
      accountEpoch: 1,
      generatedAt: '2026-11-08T12:00:00.000Z',
      tasks: {
        todayTotal: 4,
        todayCompleted: 2,
        todayRemaining: 2,
        overdueCount: 1,
        items: [
          {
            id: 't1',
            title: 'Task 1',
            dueDate: '2026-11-08',
            dueTime: '09:00',
            isTimed: true,
            status: 'completed',
            completedAt: '2026-11-08T10:00:00.000Z',
          },
          {
            id: 't2',
            title: 'Task 2',
            dueDate: '2026-11-08',
            dueTime: null,
            isTimed: false,
            status: 'pending',
            completedAt: null,
          },
        ],
      },
      mood: {
        latestMoodType: 'calm',
        latestLoggedAt: '2026-11-08T11:00:00.000Z',
      },
      quote: {
        id: 'quote-01',
        text: 'Peace comes from within.',
        author: 'Buddha',
      },
    };

    writeSnapshot(activeFile, mockSnapshot);

    const model = readWidgetModelFromDir(appGroupDir, 1);
    expect(model.isPlaceholder).toBe(false);
    expect(model.tasks?.todayTotal).toBe(4);
    expect(model.tasks?.todayCompleted).toBe(2);
    expect(model.tasks?.overdueCount).toBe(1);
    expect(model.tasks?.items).toHaveLength(2);
    expect(model.mood?.latestMoodType).toBe('calm');
    expect(model.quote?.author).toBe('Buddha');
  });

  it('Missing current.json -> placeholder, no crash', () => {
    // No current.json in App Group directory
    const model = readWidgetModelFromDir(appGroupDir);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
  });

  it('Corrupt JSON -> placeholder', () => {
    // Write invalid/corrupt JSON to current.json
    fs.writeFileSync(path.join(appGroupDir, 'current.json'), '{ invalid json content', 'utf8');

    const model = readWidgetModelFromDir(appGroupDir);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
  });

  it('Epoch mismatch -> placeholder, no stale data', () => {
    const activeFile = 'snapshot_old_epoch.json';
    writeManifest({
      activeFile,
      accountEpoch: 1, // Prior epoch
      revision: 4,
      userId: 'usr_guest',
      updatedAt: '2026-11-08T10:00:00.000Z',
    });

    writeSnapshot(activeFile, {
      accountEpoch: 1,
      userId: 'usr_guest',
      tasks: { todayTotal: 10, todayCompleted: 5, overdueCount: 0, items: [] },
    });

    // App Group now expected at epoch 2
    const model = readWidgetModelFromDir(appGroupDir, 2);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
    expect(model.tasks).toBeUndefined();
  });

  it('Items >5 -> only 5', () => {
    const activeFile = 'snapshot_overflow.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_ios_2',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    const eightItems = Array.from({ length: 8 }, (_, i) => ({
      id: `task_${i + 1}`,
      title: `Task #${i + 1}`,
      status: i % 2 === 0 ? 'completed' : 'pending',
      isTimed: false,
      dueTime: null,
      dueDate: '2026-11-08',
    }));

    writeSnapshot(activeFile, {
      schemaVersion: 1,
      revision: 1,
      sourceRevision: 1,
      userId: 'usr_ios_2',
      accountEpoch: 1,
      generatedAt: '2026-11-08T12:00:00.000Z',
      tasks: {
        todayTotal: 8,
        todayCompleted: 4,
        todayRemaining: 4,
        overdueCount: 0,
        items: eightItems,
      },
      mood: { latestMoodType: null, latestLoggedAt: null },
    });

    const model = readWidgetModelFromDir(appGroupDir, 1);
    expect(model.isPlaceholder).toBe(false);
    expect(model.tasks?.items).toHaveLength(5);
    expect(model.tasks?.items?.[0].id).toBe('task_1');
    expect(model.tasks?.items?.[4].id).toBe('task_5');
  });

  it('Snapshot >1MB -> placeholder', () => {
    const activeFile = 'snapshot_huge.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_ios_3',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    // Create a file > 1MB (1,100,000 bytes)
    const largePadding = 'X'.repeat(1_100_000);
    const hugePayload = JSON.stringify({
      accountEpoch: 1,
      userId: 'usr_ios_3',
      padding: largePadding,
    });
    fs.writeFileSync(path.join(appGroupDir, activeFile), hugePayload, 'utf8');

    const model = readWidgetModelFromDir(appGroupDir, 1);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
  });
});
