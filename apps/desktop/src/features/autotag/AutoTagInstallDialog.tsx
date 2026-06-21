import { Download, ExternalLink, RefreshCcw, Sparkles } from 'lucide-react';
import type { MouseEvent } from 'react';
import type {
  AutoTagInstallMetadata,
  AutoTagInstallProgress,
  AutoTagInstallStep,
} from '../../app/types';
import { type AutoTagProgressCopy, getAutoTagProgressText } from './progressText';

export interface AutoTagInstallCopy {
  introTitle: string;
  introLead: string;
  introDetail: string;
  introLocal: string;
  introTraining: string;
  reference: string;
  metadataLoading: string;
  downloadConfirmTitle: string;
  downloadConfirm: (size: string) => string;
  inProgress: string;
  backgroundContinue: string;
  continue: string;
  cancel: string;
  close: string;
  progress: AutoTagProgressCopy;
}

interface AutoTagInstallDialogProps {
  step: AutoTagInstallStep;
  metadata: AutoTagInstallMetadata | null;
  progress: AutoTagInstallProgress | null;
  copy: AutoTagInstallCopy;
  busy: boolean;
  onCancel: () => void;
  onContinueIntro: () => void;
  onStartInstall: () => void;
  onDismissProgress: () => void;
  onOpenExternalLink: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function AutoTagInstallDialog({
  step,
  metadata,
  progress,
  copy,
  busy,
  onCancel,
  onContinueIntro,
  onStartInstall,
  onDismissProgress,
  onOpenExternalLink,
}: AutoTagInstallDialogProps) {
  if (!step) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true">
        {step === 'intro' ? (
          <>
            <div className="modal-heading">
              <Sparkles size={20} />
              <h2>{copy.introTitle}</h2>
            </div>
            <div className="modal-copy">
              <p>{copy.introLead}</p>
              <p>{copy.introDetail}</p>
              <p>{copy.introLocal}</p>
              <p>{copy.introTraining}</p>
              <a href="https://github.com/fpgaminer/joytag" onClick={onOpenExternalLink}>
                <ExternalLink size={14} />
                {copy.reference}
              </a>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={onContinueIntro}
                disabled={busy}
              >
                {copy.continue}
              </button>
            </div>
          </>
        ) : null}

        {step === 'metadata' ? (
          <>
            <div className="modal-heading">
              <RefreshCcw size={20} />
              <h2>{copy.metadataLoading}</h2>
            </div>
            <div className="modal-copy">
              <p>{copy.introDetail}</p>
            </div>
          </>
        ) : null}

        {step === 'confirm' && metadata ? (
          <>
            <div className="modal-heading">
              <Download size={20} />
              <h2>{copy.downloadConfirmTitle}</h2>
            </div>
            <div className="modal-copy">
              <p>{copy.downloadConfirm(metadata.downloadSize)}</p>
              <a href={metadata.modelUrl} onClick={onOpenExternalLink}>
                <ExternalLink size={14} />
                {metadata.modelName}
              </a>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={onStartInstall}
                disabled={busy}
              >
                {copy.continue}
              </button>
            </div>
          </>
        ) : null}

        {step === 'progress' && progress ? (
          <>
            <div className="modal-heading">
              <Sparkles size={20} />
              <h2>{copy.inProgress}</h2>
            </div>
            <div className="modal-copy">
              <p>{getAutoTagProgressText(progress, copy.progress)}</p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(progress.percent)}%` }}
                />
              </div>
              <span className="muted">{Math.round(progress.percent)}%</span>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={onDismissProgress}>
                {progress.running ? copy.backgroundContinue : copy.close}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
