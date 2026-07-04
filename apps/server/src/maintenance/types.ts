import type { DatabaseSync } from 'node:sqlite';

export interface MaintenanceTaskContext {
  db: DatabaseSync;
  reportProgress: (processed: number, total: number) => void;
}

export interface MaintenanceTaskResult {
  processed: number;
  total: number;
  failed: number;
}

export interface MaintenanceTask {
  id: string;
  title: string;
  description: string;
  /** Whether this task should be considered for automatic execution on server startup. */
  autoRun: boolean;
  countPending(db: DatabaseSync): number;
  run(ctx: MaintenanceTaskContext): Promise<MaintenanceTaskResult>;
}
