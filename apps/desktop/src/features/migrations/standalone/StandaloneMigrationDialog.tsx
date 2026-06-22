import { Database } from 'lucide-react';
import type {
  StandaloneMigrationCopy,
  StandaloneMigrationProgress,
  StandaloneMigrationStatus,
} from './types';

interface StandaloneMigrationDialogProps {
  status: StandaloneMigrationStatus | null;
  progress: StandaloneMigrationProgress | null;
  copy: StandaloneMigrationCopy;
  canApply: boolean;
  onApply: () => void;
  onClose: () => void;
}

export function StandaloneMigrationDialog({
  status,
  progress,
  copy,
  canApply,
  onApply,
  onClose,
}: StandaloneMigrationDialogProps) {
  const running = progress?.running ?? false;
  const completed = Boolean(progress?.completed && !progress.error);
  const progressTitle = completed
    ? copy.completedTitle
    : progress?.error
      ? copy.errorTitle
      : copy.inProgress;
  const modalTitle = completed ? copy.completedTitle : copy.modalTitle;
  const pending = status?.pending ?? [];
  const showProgress = Boolean(
    progress && (progress.running || progress.completed || progress.error)
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <Database size={20} />
          <h2>{modalTitle}</h2>
        </div>
        <div className="modal-copy">
          {!completed ? (
            <>
              <p>{copy.modalBody}</p>
              <p>{copy.backupNotice}</p>
              {status?.currentVersion || status?.latestVersion ? (
                <p>
                  {copy.currentVersion}: {status.currentVersion ?? '-'} / {copy.latestVersion}:{' '}
                  {status.latestVersion ?? '-'}
                </p>
              ) : null}
              {pending.length > 0 ? (
                <div className="migration-list">
                  <strong>{copy.pendingList}</strong>
                  {pending.map((migration) => (
                    <span key={migration.id}>
                      {migration.id} - {migration.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {status?.error ? <div className="message-box">{status.error}</div> : null}
          {showProgress && progress ? (
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
                <strong>{progressTitle}</strong>
              </div>
              <p>{progress.message}</p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(progress.percent)}%` }}
                />
              </div>
              <span className="muted">{Math.round(progress.percent)}%</span>
              {progress.backupPath ? <p className="muted">Backup: {progress.backupPath}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          {completed ? (
            <button type="button" className="primary-button" onClick={onClose}>
              {copy.ok}
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={running}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={onApply}
                disabled={!canApply || running}
              >
                <Database size={15} />
                {copy.apply}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
