import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Folder, RefreshCcw } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { FfmpegCandidate, PdfRasterizerCandidate } from '../../app/types';

type MediaDependencyCandidate = FfmpegCandidate | PdfRasterizerCandidate;

interface MediaDependencySectionProps {
  id: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  groupTitle: string;
  pathLabel: string;
  autoDetectLabel: string;
  readyTitle: string;
  missingTitle: string;
  readyDescription: string;
  missingDescription: string;
  candidatesLabel: string;
  noCandidatesLabel: string;
  refreshLabel: string;
  chooseLabel: string;
  statusClass: string;
  selectedCandidate: MediaDependencyCandidate | null;
  candidates: MediaDependencyCandidate[];
  value: string;
  disabled: boolean;
  onSelectChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRefresh: () => void;
  onChoose: () => void;
}

export function MediaDependencySection({
  id,
  Icon,
  title,
  description,
  groupTitle,
  pathLabel,
  autoDetectLabel,
  readyTitle,
  missingTitle,
  readyDescription,
  missingDescription,
  candidatesLabel,
  noCandidatesLabel,
  refreshLabel,
  chooseLabel,
  statusClass,
  selectedCandidate,
  candidates,
  value,
  disabled,
  onSelectChange,
  onRefresh,
  onChoose,
}: MediaDependencySectionProps) {
  return (
    <div id={id} className="section-panel">
      <div className="section-heading">
        <Icon size={18} />
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className={statusClass}>
        <div className="migration-status-icon">
          {selectedCandidate?.valid ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <div className="migration-status-body">
          <h3>{selectedCandidate?.valid ? readyTitle : missingTitle}</h3>
          <p>{selectedCandidate?.valid ? readyDescription : missingDescription}</p>
          {selectedCandidate?.path ? (
            <span className="migration-storage">{selectedCandidate.path}</span>
          ) : null}
        </div>
      </div>

      <div className="settings-group">
        <div className="group-heading">
          <Icon size={16} />
          <h3>{groupTitle}</h3>
        </div>
        <label className="field">
          <span>{pathLabel}</span>
          <div className="select-action-row">
            <select value={value} disabled={disabled} onChange={onSelectChange}>
              <option value="">{autoDetectLabel}</option>
              {candidates.map((candidate) => (
                <option key={candidate.path} value={candidate.path}>
                  {candidate.valid ? candidate.label : `${candidate.label} - invalid`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              onClick={onRefresh}
              disabled={disabled}
              title={refreshLabel}
            >
              <RefreshCcw size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={onChoose}
              disabled={disabled}
              title={chooseLabel}
            >
              <Folder size={15} />
            </button>
          </div>
        </label>

        <div className="candidate-list" aria-label={candidatesLabel}>
          <div className="candidate-list-heading">{candidatesLabel}</div>
          {candidates.length === 0 ? (
            <span className="muted">{noCandidatesLabel}</span>
          ) : (
            candidates.map((candidate) => (
              <div
                key={candidate.path}
                className={
                  candidate.path === selectedCandidate?.path
                    ? 'candidate-item active'
                    : 'candidate-item'
                }
              >
                <span
                  className={candidate.valid ? 'candidate-state ready' : 'candidate-state missing'}
                >
                  {candidate.valid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                </span>
                <div className="candidate-body">
                  <strong>{candidate.path}</strong>
                  <span>{candidate.version || candidate.details}</span>
                  {candidate.version ? <span>{candidate.details}</span> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
