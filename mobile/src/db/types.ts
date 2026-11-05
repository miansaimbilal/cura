export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface IDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: any[]): Promise<RunResult>;
  getFirstAsync<T>(source: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync?(): Promise<void>;
}
