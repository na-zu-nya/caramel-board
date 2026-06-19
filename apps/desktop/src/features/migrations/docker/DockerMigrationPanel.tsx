import { AlertCircle, CheckCircle2, Database, Folder, RefreshCcw } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type {
  AppSettings,
  DockerMigrationProgress,
  DockerSourceDetection,
} from '../../../app/types';
import type { DockerMigrationCopy } from './types';

interface DockerMigrationPanelProps {
  settings: AppSettings;
  disabled: boolean;
  detection: DockerSourceDetection | null;
  detectionAttempted: boolean;
  progress: DockerMigrationProgress | null;
  copy: DockerMigrationCopy;
  onChooseStorage: () => void;
  onDetect: () => void;
  onMigrate: () => void;
  onTextSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBooleanSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function DockerMigrationPanel({
  settings,
  disabled,
  detection,
  detectionAttempted,
  progress,
  copy,
  onChooseStorage,
  onDetect,
  onMigrate,
  onTextSettingChange,
  onBooleanSettingChange,
}: DockerMigrationPanelProps) {
  return (
    <div className="settings-group">
      <div className="group-heading">
        <Database size={16} />
        <h3>{copy.title}</h3>
      </div>
      <p className="muted">{copy.description}</p>

      <div
        className={
          detection?.available
            ? 'migration-status ready'
            : detectionAttempted
              ? 'migration-status missing'
              : 'migration-status waiting'
        }
      >
        <div className="migration-status-icon">
          {detection?.available ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <div className="migration-status-body">
          <h3>
            {detection?.available
              ? copy.readyTitle
              : detectionAttempted
                ? copy.notFoundTitle
                : copy.waitingTitle}
          </h3>
          <p>
            {detection?.available
              ? copy.readyDescription(
                  detection.datasetCount,
                  detection.stackCount,
                  detection.assetCount
                )
              : detectionAttempted
                ? copy.notFoundDescription
                : copy.waitingDescription}
          </p>
          {detection?.available && detection.storageRoot ? (
            <span className="migration-storage">
              {copy.storageLocation}: {detection.storageRoot}
            </span>
          ) : null}
        </div>
      </div>

      <label className="field">
        <span>{copy.storageRoot}</span>
        <div className="path-row">
          <input
            value={settings.dockerStorageRoot}
            disabled={disabled}
            data-setting="dockerStorageRoot"
            onChange={onTextSettingChange}
          />
          <button
            type="button"
            className="icon-button"
            onClick={onChooseStorage}
            disabled={disabled}
            title={copy.chooseStorageRoot}
          >
            <Folder size={15} />
          </button>
        </div>
      </label>

      <div className="button-row migration-actions">
        <button type="button" onClick={onDetect} disabled={disabled}>
          <RefreshCcw size={15} />
          {copy.detect}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onMigrate}
          disabled={disabled || !settings.dockerStorageRoot.trim() || progress?.running}
        >
          <Database size={15} />
          {copy.migrate}
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
          {progress.lastLog ? <p className="muted">{progress.lastLog}</p> : null}
        </div>
      ) : null}

      <details className="advanced-settings">
        <summary>{copy.advancedSettings}</summary>
        <p>{copy.advancedDescription}</p>
        <label className="field">
          <span>{copy.postgresDatabaseUrl}</span>
          <input
            value={settings.dockerDatabaseUrl}
            disabled={disabled}
            data-setting="dockerDatabaseUrl"
            onChange={onTextSettingChange}
          />
        </label>
        <div className="auth-grid">
          <label className="field compact">
            <span>{copy.datasetId}</span>
            <input
              value={settings.dockerDatasetId}
              placeholder={copy.optional}
              disabled={disabled}
              data-setting="dockerDatasetId"
              onChange={onTextSettingChange}
            />
          </label>
          <label className="toggle-row bottom-aligned">
            <input
              type="checkbox"
              checked={settings.dockerVerifyFiles}
              disabled={disabled}
              data-setting="dockerVerifyFiles"
              onChange={onBooleanSettingChange}
            />
            <span>{copy.verifyFileReferences}</span>
          </label>
        </div>
      </details>
    </div>
  );
}
