import * as SQLite from 'expo-sqlite';
import { IDatabase } from './types';
import { runMigrations } from './migrations';

let databaseInstance: IDatabase | null = null;
let initPromise: Promise<IDatabase> | null = null;

/**
 * Initializes and returns the primary SQLite database instance.
 * Thread-safe with singleton memoization.
 */
export async function getDatabase(): Promise<IDatabase> {
  if (databaseInstance) {
    return databaseInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('cura.db');

      // Enable WAL journal mode for performance and concurrent read/write
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // Execute schema migrations safely
      await runMigrations(db);

      databaseInstance = db;
      return db;
    } catch (err) {
      // Clear promise so subsequent calls can retry
      initPromise = null;
      throw err;
    }
  })();

  return await initPromise;
}

/**
 * For testing or reset purposes: sets or clears the current database instance.
 */
export function setDatabaseInstance(db: IDatabase | null): void {
  databaseInstance = db;
  initPromise = null;
}
