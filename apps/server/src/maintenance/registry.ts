import { backfillAssetDimensionsTask } from './tasks/backfill-asset-dimensions';
import type { MaintenanceTask } from './types';

export const maintenanceTasks: MaintenanceTask[] = [backfillAssetDimensionsTask];

export const findMaintenanceTask = (taskId: string): MaintenanceTask | undefined =>
  maintenanceTasks.find((task) => task.id === taskId);
