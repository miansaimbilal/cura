import { NodeSQLiteAdapter } from './sqliteAdapter';

export const openDatabaseAsync = async (_dbName?: string) => {
  return new NodeSQLiteAdapter(':memory:');
};

export default {
  openDatabaseAsync,
};
