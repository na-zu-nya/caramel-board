import { Hono } from 'hono';
import {
  getMaintenanceTaskRunner,
  MaintenanceTaskAlreadyRunningError,
  MaintenanceTaskNotFoundError,
} from '../maintenance/runner';

export const maintenanceRoute = new Hono();

// GET /maintenance/tasks
maintenanceRoute.get('/tasks', (c) => {
  return c.json({ tasks: getMaintenanceTaskRunner().getTasksStatus() });
});

// POST /maintenance/tasks/:taskId/run
maintenanceRoute.post('/tasks/:taskId/run', (c) => {
  const taskId = c.req.param('taskId');

  try {
    const { runId } = getMaintenanceTaskRunner().runTask(taskId);
    return c.json({ runId }, 202);
  } catch (error) {
    if (error instanceof MaintenanceTaskNotFoundError) {
      return c.json({ error: error.message }, 404);
    }
    if (error instanceof MaintenanceTaskAlreadyRunningError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }
});

// GET /maintenance/runs/:runId
maintenanceRoute.get('/runs/:runId', (c) => {
  const runId = Number.parseInt(c.req.param('runId'), 10);
  if (Number.isNaN(runId)) return c.json({ error: 'Invalid run id' }, 400);

  const run = getMaintenanceTaskRunner().getRun(runId);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json(run);
});
