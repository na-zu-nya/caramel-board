import { AlertCircle, Database } from 'lucide-react';

interface DockerMigrationResetDialogProps {
  title: string;
  body: string;
  dbLabel: string;
  libraryLabel: string;
  dbPath: string;
  libraryPath: string;
  cancelLabel: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DockerMigrationResetDialog({
  title,
  body,
  dbLabel,
  libraryLabel,
  dbPath,
  libraryPath,
  cancelLabel,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: DockerMigrationResetDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <AlertCircle size={20} />
          <h2>{title}</h2>
        </div>
        <div className="modal-copy">
          <p>{body}</p>
          <div className="migration-list">
            <span>
              {dbLabel}: {dbPath}
            </span>
            <span>
              {libraryLabel}: {libraryPath}
            </span>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            <Database size={15} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
