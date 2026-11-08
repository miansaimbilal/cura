import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readWidgetModelFromDir } from '../../../src/services/widgets/widgetModelReader';
import { WidgetSnapshot } from '../../../src/services/widgets/types';

describe('Android Widget UI Data Model Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cura-widget-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  function writeManifest(manifest: any) {
    fs.writeFileSync(path.join(tempDir, 'current.json'), JSON.stringify(manifest), 'utf8');
  }

  function writeSnapshot(filename: string, snapshot: any) {
    fs.writeFileSync(path.join(tempDir, filename), JSON.stringify(snapshot), 'utf8');
  }

  it('Valid manifest + snapshot -> widget data model returns correct todayTotal, items, mood, quote', () => {
    const activeFile = 'snapshot_usr_1_1_valid.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_android',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    const mockSnapshot: Partial<WidgetSnapshot> = {
      schemaVersion: 1,
      revision: 1,
      sourceRevision: 1,
      userId: 'usr_android',
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
            completedAt: '2026-11-08T09:30:00.000Z',
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
        latestLoggedAt: '2026-11-08T11:30:00.000Z',
      },
      quote: {
        id: 'quote-01',
        text: 'Smile, breathe, and go slowly.',
        author: 'Thich Nhat Hanh',
      },
    };

    writeSnapshot(activeFile, mockSnapshot);

    const model = readWidgetModelFromDir(tempDir, 1);
    expect(model.isPlaceholder).toBe(false);
    expect(model.tasks?.todayTotal).toBe(4);
    expect(model.tasks?.todayCompleted).toBe(2);
    expect(model.tasks?.overdueCount).toBe(1);
    expect(model.tasks?.items).toHaveLength(2);
    expect(model.tasks?.items[0].title).toBe('Task 1');
    expect(model.mood?.latestMoodType).toBe('calm');
    expect(model.quote?.author).toBe('Thich Nhat Hanh');
  });

  it('Missing current.json -> placeholder model, no crash', () => {
    // Empty directory without current.json
    const model = readWidgetModelFromDir(tempDir, 1);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
    expect(model.tasks).toBeUndefined();
  });

  it('Corrupt JSON -> placeholder model, no crash', () => {
    fs.writeFileSync(path.join(tempDir, 'current.json'), '{ invalid json @@# ', 'utf8');
    const model = readWidgetModelFromDir(tempDir, 1);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
  });

  it('Epoch mismatch -> placeholder model, no stale data', () => {
    const activeFile = 'snapshot_usr_1_1_old.json';
    writeManifest({
      activeFile,
      accountEpoch: 1, // manifest is from epoch 1
      revision: 1,
      userId: 'usr_android',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });
    writeSnapshot(activeFile, { tasks: { todayTotal: 1, items: [] } });

    // Client expects epoch 2
    const model = readWidgetModelFromDir(tempDir, 2);
    expect(model.isPlaceholder).toBe(true);
    expect(model.tasks).toBeUndefined();
  });

  it('Task list >5 -> only first 5 returned', () => {
    const activeFile = 'snapshot_usr_1_1_many.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_android',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    const items = [];
    for (let i = 1; i <= 10; i++) {
      items.push({
        id: `t_${i}`,
        title: `Task ${i}`,
        dueDate: '2026-11-08',
        dueTime: null,
        isTimed: false,
        status: 'pending' as const,
        completedAt: null,
      });
    }

    writeSnapshot(activeFile, {
      tasks: {
        todayTotal: 10,
        todayCompleted: 0,
        overdueCount: 0,
        items,
      },
    });

    const model = readWidgetModelFromDir(tempDir, 1);
    expect(model.isPlaceholder).toBe(false);
    expect(model.tasks?.todayTotal).toBe(10);
    // Strict RemoteViews display ceiling: 5 items
    expect(model.tasks?.items).toHaveLength(5);
    expect(model.tasks?.items[0].title).toBe('Task 1');
    expect(model.tasks?.items[4].title).toBe('Task 5');
  });

  it('Snapshot >1MB -> reject / placeholder (Binder protection)', () => {
    const activeFile = 'snapshot_huge.json';
    writeManifest({
      activeFile,
      accountEpoch: 1,
      revision: 1,
      userId: 'usr_android',
      updatedAt: '2026-11-08T12:00:00.000Z',
    });

    // Generate snapshot exceeding 1MB
    const bigString = 'x'.repeat(1024 * 1024 + 100);
    fs.writeFileSync(path.join(tempDir, activeFile), JSON.stringify({ padding: bigString }), 'utf8');

    const model = readWidgetModelFromDir(tempDir, 1);
    expect(model.isPlaceholder).toBe(true);
    expect(model.placeholderMessage).toBe('Open Cura to refresh');
  });
});
