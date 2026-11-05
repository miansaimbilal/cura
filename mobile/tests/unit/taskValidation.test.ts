import { describe, it, expect, beforeEach } from 'vitest';
import { NodeSQLiteAdapter } from '../helpers/sqliteAdapter';
import { runMigrations } from '../../src/db/migrations';
import { createTask, updateTask } from '../../src/db/taskRepository';

describe('Task Input Validation & Business Rules (Unit Tests)', () => {
  let db: NodeSQLiteAdapter;

  beforeEach(async () => {
    db = new NodeSQLiteAdapter(':memory:');
    await runMigrations(db);
  });

  it('rejects empty title or whitespace-only title', async () => {
    await expect(createTask(db, { title: '' })).rejects.toThrow('Task title cannot be empty');
    await expect(createTask(db, { title: '   ' })).rejects.toThrow('Task title cannot be empty');
  });

  it('rejects titles exceeding 255 characters', async () => {
    const longTitle = 'A'.repeat(256);
    await expect(createTask(db, { title: longTitle })).rejects.toThrow(
      'Task title cannot exceed 255 characters'
    );
  });

  it('rejects invalid due date formats on creation', async () => {
    await expect(
      createTask(db, { title: 'Valid title', dueDate: '11/05/2026' })
    ).rejects.toThrow('Invalid due date format. Expected YYYY-MM-DD');

    await expect(
      createTask(db, { title: 'Valid title', dueDate: 'not-a-date' })
    ).rejects.toThrow('Invalid due date format. Expected YYYY-MM-DD');
  });

  it('rejects invalid due time formats on creation', async () => {
    await expect(
      createTask(db, { title: 'Valid title', dueTime: '25:00' })
    ).rejects.toThrow('Invalid due time format. Expected HH:MM');

    await expect(
      createTask(db, { title: 'Valid title', dueTime: '9:30' })
    ).rejects.toThrow('Invalid due time format. Expected HH:MM');
  });

  it('rejects updates on non-existent or deleted tasks', async () => {
    await expect(
      updateTask(db, 'non-existent-uuid', { title: 'New title' })
    ).rejects.toThrow('not found or has been deleted');
  });

  it('rejects updating a task with an empty title', async () => {
    const created = await createTask(db, { title: 'Initial title' });
    await expect(
      updateTask(db, created.id, { title: '   ' })
    ).rejects.toThrow('Task title cannot be empty');
  });
});
