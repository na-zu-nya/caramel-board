import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceTask, MaintenanceTaskResult } from './types';

const { fakeTasks } = vi.hoisted(() => ({ fakeTasks: [] as MaintenanceTask[] }));

vi.mock('./registry', () => ({
  maintenanceTasks: fakeTasks,
  findMaintenanceTask: (taskId: string) => fakeTasks.find((task) => task.id === taskId),
}));

const { MaintenanceTaskAlreadyRunningError, MaintenanceTaskNotFoundError, MaintenanceTaskRunner } =
  await import('./runner');

const schemaPath = resolve(process.cwd(), 'sqlite/schema.sql');

const flushAsync = () => new Promise((resolveTick) => setTimeout(resolveTick, 0));

const makeTask = (overrides: Partial<MaintenanceTask> & { id: string }): MaintenanceTask => ({
  title: overrides.id,
  description: overrides.id,
  autoRun: false,
  countPending: () => 0,
  run: async () => ({ processed: 0, total: 0, failed: 0 }),
  ...overrides,
});

describe('MaintenanceTaskRunner', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(readFileSync(schemaPath, 'utf8'));
    fakeTasks.length = 0;
  });

  afterEach(() => {
    db.close();
  });

  it('records a run to completion in maintenance_task_runs', async () => {
    fakeTasks.push(
      makeTask({
        id: 'quick-task',
        countPending: () => 2,
        run: async (ctx) => {
          ctx.reportProgress(1, 2);
          ctx.reportProgress(2, 2);
          return { processed: 2, total: 2, failed: 0 };
        },
      })
    );
    const runner = new MaintenanceTaskRunner(db);

    const { runId } = runner.runTask('quick-task');
    await flushAsync();

    const run = runner.getRun(runId);
    expect(run).toMatchObject({
      id: runId,
      taskId: 'quick-task',
      status: 'succeeded',
      processed: 2,
      total: 2,
      error: null,
    });
    expect(run?.finishedAt).toBeTruthy();

    const status = runner.getTasksStatus();
    expect(status).toEqual([
      expect.objectContaining({ id: 'quick-task', running: false, pendingCount: 2 }),
    ]);
    expect(status[0].lastRun?.id).toBe(runId);
  });

  it('records a failed run when the task throws', async () => {
    fakeTasks.push(
      makeTask({
        id: 'broken-task',
        run: async () => {
          throw new Error('boom');
        },
      })
    );
    const runner = new MaintenanceTaskRunner(db);

    const { runId } = runner.runTask('broken-task');
    await flushAsync();

    const run = runner.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe('boom');
  });

  it('rejects starting a task while another run is already in progress', async () => {
    let resolveRun!: (result: MaintenanceTaskResult) => void;
    fakeTasks.push(
      makeTask({
        id: 'slow-task',
        run: () =>
          new Promise((resolve) => {
            resolveRun = resolve;
          }),
      })
    );
    const runner = new MaintenanceTaskRunner(db);

    const { runId } = runner.runTask('slow-task');
    expect(() => runner.runTask('slow-task')).toThrow(MaintenanceTaskAlreadyRunningError);
    expect(runner.getTasksStatus()[0].running).toBe(true);

    resolveRun({ processed: 1, total: 1, failed: 0 });
    await flushAsync();

    expect(runner.getRun(runId)?.status).toBe('succeeded');
    expect(runner.getTasksStatus()[0].running).toBe(false);
  });

  it('throws MaintenanceTaskNotFoundError for unknown task ids', () => {
    const runner = new MaintenanceTaskRunner(db);
    expect(() => runner.runTask('does-not-exist')).toThrow(MaintenanceTaskNotFoundError);
  });

  it('autoRunPending only runs autoRun tasks that have pending work', async () => {
    const ran: string[] = [];
    fakeTasks.push(
      makeTask({
        id: 'eligible',
        autoRun: true,
        countPending: () => 3,
        run: async () => {
          ran.push('eligible');
          return { processed: 3, total: 3, failed: 0 };
        },
      }),
      makeTask({
        id: 'no-pending',
        autoRun: true,
        countPending: () => 0,
        run: async () => {
          ran.push('no-pending');
          return { processed: 0, total: 0, failed: 0 };
        },
      }),
      makeTask({
        id: 'manual-only',
        autoRun: false,
        countPending: () => 5,
        run: async () => {
          ran.push('manual-only');
          return { processed: 5, total: 5, failed: 0 };
        },
      })
    );
    const runner = new MaintenanceTaskRunner(db);

    await runner.autoRunPending();

    expect(ran).toEqual(['eligible']);
    expect(runner.getTasksStatus().find((s) => s.id === 'eligible')?.lastRun?.status).toBe(
      'succeeded'
    );
  });
});
