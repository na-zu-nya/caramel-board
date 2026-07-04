import type { DatabaseSync } from 'node:sqlite';
import { getStandaloneSqlite, nowIso } from '../repositories/sqlite/sqlite';
import { findMaintenanceTask, maintenanceTasks } from './registry';
import type { MaintenanceTask } from './types';

export class MaintenanceTaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`Unknown maintenance task: ${taskId}`);
    this.name = 'MaintenanceTaskNotFoundError';
  }
}

export class MaintenanceTaskAlreadyRunningError extends Error {
  constructor(readonly taskId: string) {
    super(`Maintenance task is already running: ${taskId}`);
    this.name = 'MaintenanceTaskAlreadyRunningError';
  }
}

type MaintenanceRunStatus = 'running' | 'succeeded' | 'failed';

interface MaintenanceRunRow {
  id: number;
  task_id: string;
  status: MaintenanceRunStatus;
  total: number | null;
  processed: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface MaintenanceRunRecord {
  id: number;
  taskId: string;
  status: MaintenanceRunStatus;
  total: number | null;
  processed: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface MaintenanceTaskStatus {
  id: string;
  title: string;
  description: string;
  pendingCount: number;
  running: boolean;
  lastRun: MaintenanceRunRecord | null;
}

const toRunRecord = (row: MaintenanceRunRow): MaintenanceRunRecord => ({
  id: row.id,
  taskId: row.task_id,
  status: row.status,
  total: row.total,
  processed: row.processed,
  error: row.error,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
});

export class MaintenanceTaskRunner {
  private activeTaskId: string | null = null;

  constructor(private readonly db: DatabaseSync = getStandaloneSqlite()) {}

  getRun(runId: number): MaintenanceRunRecord | null {
    const row = this.db.prepare('SELECT * FROM maintenance_task_runs WHERE id = ?').get(runId) as
      | MaintenanceRunRow
      | undefined;
    return row ? toRunRecord(row) : null;
  }

  private getLastRun(taskId: string): MaintenanceRunRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM maintenance_task_runs WHERE task_id = ? ORDER BY started_at DESC, id DESC LIMIT 1'
      )
      .get(taskId) as MaintenanceRunRow | undefined;
    return row ? toRunRecord(row) : null;
  }

  getTasksStatus(): MaintenanceTaskStatus[] {
    return maintenanceTasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      pendingCount: task.countPending(this.db),
      running: this.activeTaskId === task.id,
      lastRun: this.getLastRun(task.id),
    }));
  }

  /** Starts a task run. Returns the run id immediately; the task keeps executing in the background. */
  runTask(taskId: string): { runId: number } {
    const { runId } = this.startTask(taskId);
    return { runId };
  }

  /** Runs every autoRun-eligible task that currently has pending work, one at a time. */
  async autoRunPending(): Promise<void> {
    for (const task of maintenanceTasks) {
      if (!task.autoRun) continue;
      try {
        if (task.countPending(this.db) <= 0) continue;
        const { done } = this.startTask(task.id);
        await done;
      } catch (error) {
        console.error(`Failed to auto-run maintenance task: ${task.id}`, error);
      }
    }
  }

  private startTask(taskId: string): { runId: number; done: Promise<void> } {
    const task = findMaintenanceTask(taskId);
    if (!task) throw new MaintenanceTaskNotFoundError(taskId);
    if (this.activeTaskId) throw new MaintenanceTaskAlreadyRunningError(this.activeTaskId);

    const result = this.db
      .prepare(
        `INSERT INTO maintenance_task_runs (task_id, status, total, processed, started_at)
         VALUES (?, 'running', NULL, 0, ?)`
      )
      .run(taskId, nowIso());
    const runId = Number(result.lastInsertRowid);

    this.activeTaskId = taskId;
    const done = this.executeTask(task, runId).finally(() => {
      this.activeTaskId = null;
    });

    return { runId, done };
  }

  private async executeTask(task: MaintenanceTask, runId: number): Promise<void> {
    try {
      const result = await task.run({
        db: this.db,
        reportProgress: (processed, total) => {
          this.db
            .prepare('UPDATE maintenance_task_runs SET processed = ?, total = ? WHERE id = ?')
            .run(processed, total, runId);
        },
      });
      this.db
        .prepare(
          `UPDATE maintenance_task_runs
           SET status = 'succeeded', processed = ?, total = ?, finished_at = ?
           WHERE id = ?`
        )
        .run(result.processed, result.total, nowIso(), runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Maintenance task failed: ${task.id}`, error);
      this.db
        .prepare(
          `UPDATE maintenance_task_runs
           SET status = 'failed', error = ?, finished_at = ?
           WHERE id = ?`
        )
        .run(message, nowIso(), runId);
    }
  }
}

// The singleton is created lazily so importing this module (e.g. via the route layer)
// never touches the database until a maintenance task is actually requested. This keeps
// the server importable/testable even when STANDALONE_SQLITE_PATH isn't configured yet.
let singleton: MaintenanceTaskRunner | null = null;

export const getMaintenanceTaskRunner = (): MaintenanceTaskRunner => {
  if (!singleton) {
    singleton = new MaintenanceTaskRunner();
  }
  return singleton;
};
