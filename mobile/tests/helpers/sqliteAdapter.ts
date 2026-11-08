import { DatabaseSync } from 'node:sqlite';
import { IDatabase, RunResult } from '../../src/db/types';

/**
 * An adapter wrapping Node.js built-in DatabaseSync (Node 22+)
 * to fulfill the exact IDatabase interface of expo-sqlite.
 * This runs genuine, native SQLite operations without mocking.
 */
export class NodeSQLiteAdapter implements IDatabase {
  public rawDb: DatabaseSync;
  private transactionDepth = 0;

  constructor(filename: string = ':memory:') {
    this.rawDb = new DatabaseSync(filename);
  }

  async execAsync(source: string): Promise<void> {
    this.rawDb.exec(source);
  }

  async runAsync(source: string, ...params: any[]): Promise<RunResult> {
    const stmt = this.rawDb.prepare(source);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, ...params: any[]): Promise<T | null> {
    const stmt = this.rawDb.prepare(source);
    const row = stmt.get(...params);
    return (row as T) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: any[]): Promise<T[]> {
    const stmt = this.rawDb.prepare(source);
    const rows = stmt.all(...params);
    return rows as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    const depth = this.transactionDepth;
    const savepointName = `cura_nested_${depth}`;

    if (depth === 0) {
      this.rawDb.exec('BEGIN TRANSACTION;');
    } else {
      this.rawDb.exec(`SAVEPOINT ${savepointName};`);
    }

    this.transactionDepth++;

    try {
      await task();
      if (depth === 0) {
        this.rawDb.exec('COMMIT;');
      } else {
        this.rawDb.exec(`RELEASE SAVEPOINT ${savepointName};`);
      }
    } catch (err) {
      try {
        if (depth === 0) {
          this.rawDb.exec('ROLLBACK;');
        } else {
          this.rawDb.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          this.rawDb.exec(`RELEASE SAVEPOINT ${savepointName};`);
        }
      } catch {
        // preserve original error
      }
      throw err;
    } finally {
      this.transactionDepth--;
    }
  }

  async closeAsync(): Promise<void> {
    this.rawDb.close();
  }
}
