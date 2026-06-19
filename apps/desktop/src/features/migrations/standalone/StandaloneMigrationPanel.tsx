import { AlertCircle, CheckCircle2, Database, RefreshCcw } from 'lucide-react';
import type {
  StandaloneMigrationCopy,
  StandaloneMigrationProgress,
  StandaloneMigrationStatus,
} from './types';

interface StandaloneMigrationPanelProps {
  status: StandaloneMigrationStatus | null;
  progress: StandaloneMigrationProgress | null;
  copy: StandaloneMigrationCopy;
  busy: boolean;
  canApply: boolean;
  onRefresh: () => void;
  onOpenDialog: () => void;
}

const getStatusClass = (status: StandaloneMigrationStatus | null) => {
  if (status?.status === 'ready') return 'migration-status ready';
  if (status?.status === 'history_mismatch') return 'migration-status missing';
  return 'migration-status waiting';
};

const getTitle = (status: StandaloneMigrationStatus | null, copy: StandaloneMigrationCopy) => {
  if (status?.status === 'ready') return copy.readyTitle;
  if (status?.status === 'history_mismatch') return copy.errorTitle;
  return copy.pendingTitle;
};

const getDescription = (
  status: StandaloneMigrationStatus | null,
  copy: StandaloneMigrationCopy
) => {
  if (status?.status === 'ready') return copy.readyDescription;
  if (status?.status === 'history_mismatch') return status.error || copy.errorDescription;
  return copy.pendingDescription(status?.pending.length ?? 0);
};

export function StandaloneMigrationPanel({
  status,
  progress,
  copy,
  busy,
  canApply,
  onRefresh,
  onOpenDialog,
}: StandaloneMigrationPanelProps) {
  return (
    <div className="settings-group">
      <div className="group-heading">
        <Database size={16} />
        <h3>{copy.title}</h3>
      </div>
      <p className="muted">{copy.description}</p>

      <div className={getStatusClass(status)}>
        <div className="migration-status-icon">
          {status?.status === 'ready' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <div className="migration-status-body">
          <h3>{getTitle(status, copy)}</h3>
          <p>{getDescription(status, copy)}</p>
          {status?.currentVersion || status?.latestVersion ? (
            <span className="migration-storage">
              {copy.currentVersion}: {status.currentVersion ?? '-'} / {copy.latestVersion}:{' '}
              {status.latestVersion ?? '-'}
            </span>
          ) : null}
          {status?.dbPath ? <span className="migration-storage">{status.dbPath}</span> : null}
        </div>
      </div>

      <div className="button-row migration-actions">
        <button type="button" onClick={onRefresh} disabled={busy}>
          <RefreshCcw size={15} />
          {copy.check}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onOpenDialog}
          disabled={!canApply}
        >
          <Database size={15} />
          {copy.apply}
        </button>
      </div>

      {progress?.running || progress?.completed || progress?.error ? (
        <div
          className={
            progress.error
              ? 'install-progress-card error'
              : progress.completed
                ? 'install-progress-card complete'
                : 'install-progress-card'
          }
        >
          <div className="install-progress-heading">
            <Database size={16} />
            <strong>{copy.inProgress}</strong>
          </div>
          <p>{progress.message}</p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(progress.percent)}%` }} />
          </div>
          <span className="muted">{Math.round(progress.percent)}%</span>
          {progress.backupPath ? <p className="muted">Backup: {progress.backupPath}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
