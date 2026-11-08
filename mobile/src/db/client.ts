import * as SQLite from 'expo-sqlite';
import { IDatabase } from './types';
import { runMigrations } from './migrations';

let databaseInstance: IDatabase | null = null;
let initPromise: Promise<IDatabase> | null = null;

/**
 * Wraps an IDatabase to ensure nested withTransactionAsync calls use SAVEPOINTs.
 */
export function wrapWithNestedTransactions(db: IDatabase): IDatabase {
  let transactionDepth = 0;

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'withTransactionAsync') {
        return async (task: () => Promise<void>): Promise<void> => {
          const depth = transactionDepth;
          const savepointName = `cura_nested_${depth}`;

          if (depth === 0) {
            await target.execAsync('BEGIN TRANSACTION;');
          } else {
            await target.execAsync(`SAVEPOINT ${savepointName};`);
          }

          transactionDepth++;

          try {
            await task();
            if (depth === 0) {
              await target.execAsync('COMMIT;');
            } else {
              await target.execAsync(`RELEASE SAVEPOINT ${savepointName};`);
            }
          } catch (err) {
            try {
              if (depth === 0) {
                await target.execAsync('ROLLBACK;');
              } else {
                await target.execAsync(`ROLLBACK TO SAVEPOINT ${savepointName};`);
                await target.execAsync(`RELEASE SAVEPOINT ${savepointName};`);
              }
            } catch {
              // preserve original error
            }
            throw err;
          } finally {
            transactionDepth--;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

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
      const rawDb = await SQLite.openDatabaseAsync('cura.db');

      // Enable WAL journal mode for performance and concurrent read/write
      await rawDb.execAsync('PRAGMA journal_mode = WAL;');
      await rawDb.execAsync('PRAGMA foreign_keys = ON;');
      await rawDb.execAsync('PRAGMA busy_timeout = 5000;');

      const db = wrapWithNestedTransactions(rawDb);

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
