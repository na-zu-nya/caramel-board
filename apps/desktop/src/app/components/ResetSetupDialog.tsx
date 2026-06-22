import { RefreshCcw } from 'lucide-react';

interface ResetSetupDialogProps {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetSetupDialog({
  title,
  body,
  cancelLabel,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: ResetSetupDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-heading">
          <RefreshCcw size={20} />
          <h2>{title}</h2>
        </div>
        <div className="modal-copy">
          <p>{body}</p>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            <RefreshCcw size={15} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
