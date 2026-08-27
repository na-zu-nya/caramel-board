export interface DatasetProtectionStatus {
  isProtected: boolean;
  authorized: boolean;
}

type AuthorizationRequiredListener = (datasetId: string) => void;

const authorizationRequiredListeners = new Set<AuthorizationRequiredListener>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isDatasetAccessGranted(
  datasetId: string | undefined,
  protectionStatus: DatasetProtectionStatus | undefined
) {
  if (!datasetId) return true;
  if (!protectionStatus) return false;
  return !protectionStatus.isProtected || protectionStatus.authorized;
}

export function getProtectedDatasetId(payload: unknown): string | null {
  if (!isRecord(payload) || payload.protected !== true) return null;
  const datasetId = payload.datasetId;
  if (typeof datasetId !== 'string' && typeof datasetId !== 'number') return null;
  return String(datasetId);
}

export function notifyDatasetAuthorizationRequired(datasetId: string | number) {
  const normalizedDatasetId = String(datasetId);
  for (const listener of authorizationRequiredListeners) {
    listener(normalizedDatasetId);
  }
}

export function subscribeDatasetAuthorizationRequired(listener: AuthorizationRequiredListener) {
  authorizationRequiredListeners.add(listener);
  return () => authorizationRequiredListeners.delete(listener);
}
