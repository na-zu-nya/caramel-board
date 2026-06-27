import { AlertCircle, CheckCircle2, Download, Folder, RefreshCcw, Sparkles } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { AppSettings, AutoTagInstallProgress, AutoTagStatus } from '../../app/types';
import { type AutoTagProgressCopy, getAutoTagProgressText } from './progressText';

export interface AutoTagSettingsCopy {
  title: string;
  description: string;
  enable: string;
  useGpu: string;
  gpuAvailable: string;
  gpuUnavailable: string;
  threshold: string;
  thresholdLess: string;
  thresholdMore: string;
  installCompleted: string;
  installInProgress: string;
  check: string;
  prepare: string;
  advancedSettings: string;
  advancedDescription: string;
  codeFolder: string;
  modelFolder: string;
  chooseCodeFolder: string;
  chooseModelFolder: string;
  port: string;
  progress: AutoTagProgressCopy;
}

interface AutoTagSettingsSectionProps {
  settings: AppSettings;
  status: AutoTagStatus | null;
  installProgress: AutoTagInstallProgress | null;
  copy: AutoTagSettingsCopy;
  disabled: boolean;
  busy: boolean;
  statusClass: string;
  statusTitle: string;
  statusDescription: string;
  onBooleanSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTextSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onThresholdChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRefreshStatus: () => void;
  onOpenInstallDialog: () => void;
  onChooseCodeFolder: () => void;
  onChooseModelFolder: () => void;
  onPortChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function AutoTagSettingsSection({
  settings,
  status,
  installProgress,
  copy,
  disabled,
  busy,
  statusClass,
  statusTitle,
  statusDescription,
  onBooleanSettingChange,
  onTextSettingChange,
  onThresholdChange,
  onRefreshStatus,
  onOpenInstallDialog,
  onChooseCodeFolder,
  onChooseModelFolder,
  onPortChange,
}: AutoTagSettingsSectionProps) {
  const gpuPreferenceSupported = status?.gpuPreferenceSupported ?? false;
  const gpuAvailable = status?.gpuAvailable ?? false;
  const gpuChecked = gpuAvailable && settings.autoTagUseGpu;

  return (
    <div id="section-autotag" className="section-panel">
      <div className="section-heading">
        <Sparkles size={18} />
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </div>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.autoTagEnabled}
          disabled={disabled || !status?.ready}
          data-setting="autoTagEnabled"
          onChange={onBooleanSettingChange}
        />
        <span>{copy.enable}</span>
      </label>

      {gpuPreferenceSupported ? (
        <div className="toggle-stack">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={gpuChecked}
              disabled={disabled || !gpuAvailable}
              data-setting="autoTagUseGpu"
              onChange={onBooleanSettingChange}
            />
            <span>{copy.useGpu}</span>
          </label>
          <span className="muted">{gpuAvailable ? copy.gpuAvailable : copy.gpuUnavailable}</span>
        </div>
      ) : null}

      <label className="field">
        <span>{copy.threshold}</span>
        <div className="threshold-row">
          <span className="muted">{copy.thresholdLess}</span>
          <input
            type="range"
            min={10}
            max={95}
            step={5}
            value={Math.round((1 - settings.autoTagThreshold) * 100)}
            disabled={disabled}
            onChange={onThresholdChange}
          />
          <span className="muted">{copy.thresholdMore}</span>
        </div>
      </label>

      <div className={statusClass}>
        <div className="migration-status-icon">
          {status?.ready || status?.running ? (
            <CheckCircle2 size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
        </div>
        <div className="migration-status-body">
          <h3>{statusTitle}</h3>
          <p>{statusDescription}</p>
          {status?.url ? <span className="migration-storage">{status.url}</span> : null}
          {status?.logPath ? <span className="migration-storage">{status.logPath}</span> : null}
        </div>
      </div>

      {installProgress?.running || installProgress?.completed ? (
        <div
          className={
            installProgress.error
              ? 'install-progress-card error'
              : installProgress.completed
                ? 'install-progress-card complete'
                : 'install-progress-card'
          }
        >
          <div className="install-progress-heading">
            <Sparkles size={16} />
            <strong>
              {installProgress.completed ? copy.installCompleted : copy.installInProgress}
            </strong>
          </div>
          <p>{getAutoTagProgressText(installProgress, copy.progress)}</p>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.round(installProgress.percent)}%` }}
            />
          </div>
          <span className="muted">{Math.round(installProgress.percent)}%</span>
        </div>
      ) : null}

      <div className="button-row migration-actions">
        <button type="button" onClick={onRefreshStatus} disabled={busy}>
          <RefreshCcw size={15} />
          {copy.check}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onOpenInstallDialog}
          disabled={disabled || installProgress?.running || status?.ready}
        >
          <Download size={15} />
          {copy.prepare}
        </button>
      </div>

      <details className="advanced-settings">
        <summary>{copy.advancedSettings}</summary>
        <p>{copy.advancedDescription}</p>
        <label className="field">
          <span>{copy.codeFolder}</span>
          <div className="path-row">
            <input
              value={settings.autoTagRepoDir}
              disabled={disabled}
              data-setting="autoTagRepoDir"
              onChange={onTextSettingChange}
            />
            <button
              type="button"
              className="icon-button"
              onClick={onChooseCodeFolder}
              disabled={disabled}
              title={copy.chooseCodeFolder}
            >
              <Folder size={15} />
            </button>
          </div>
        </label>
        <label className="field">
          <span>{copy.modelFolder}</span>
          <div className="path-row">
            <input
              value={settings.autoTagModelDir}
              disabled={disabled}
              data-setting="autoTagModelDir"
              onChange={onTextSettingChange}
            />
            <button
              type="button"
              className="icon-button"
              onClick={onChooseModelFolder}
              disabled={disabled}
              title={copy.chooseModelFolder}
            >
              <Folder size={15} />
            </button>
          </div>
        </label>
        <div className="auth-grid">
          <label className="field compact">
            <span>{copy.port}</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={settings.autoTagPort}
              disabled={disabled}
              onChange={onPortChange}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
