import {
  Database,
  Download,
  Folder,
  Globe2,
  Languages,
  Monitor,
  PanelTop,
  RefreshCcw,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { AppSettings } from '../../app/types';

export interface GeneralSettingsCopy {
  general: string;
  generalDescription: string;
  language: string;
  displayLanguage: string;
  english: string;
  japanese: string;
  startupAndResident: string;
  startupAndResidentDescription: string;
  launchOnStartup: string;
  residentMode: string;
  trayModeHint: string;
  taskbarModeHint: string;
  dataStore: string;
  dataStoreHint: string;
  dataStoreLocation: string;
  moveDataStore: string;
  import: string;
  export: string;
  advancedDataStore: string;
  advancedDataStoreDescription: string;
  sqliteDb: string;
  chooseDatabase: string;
  moveDatabase: string;
  libraryPath: string;
  chooseLibraryFolder: string;
  moveLibrary: string;
  resetSetup: string;
  network: string;
  networkDescription: string;
  allowExternalNetwork: string;
  requireBasicAuth: string;
  requireBasicAuthHint: string;
  user: string;
  password: string;
  advancedSharing: string;
  advancedSharingDescription: string;
  port: string;
}

interface GeneralSettingsSectionProps {
  settings: AppSettings;
  dataStoreRoot: string;
  copy: GeneralSettingsCopy;
  disabled: boolean;
  shellDisabled: boolean;
  residentModeLabels: {
    taskbar: string;
    tray: string;
  };
  onLanguageChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onResidentModeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onBooleanSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTextSettingChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPortChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onMoveDataStore: () => void;
  onImportDb: () => void;
  onExportDb: () => void;
  onChooseDb: () => void;
  onMoveDb: () => void;
  onChooseLibrary: () => void;
  onMoveLibrary: () => void;
  onOpenResetSetup: () => void;
}

export function GeneralSettingsSection({
  settings,
  dataStoreRoot,
  copy,
  disabled,
  shellDisabled,
  residentModeLabels,
  onLanguageChange,
  onResidentModeChange,
  onBooleanSettingChange,
  onTextSettingChange,
  onPortChange,
  onMoveDataStore,
  onImportDb,
  onExportDb,
  onChooseDb,
  onMoveDb,
  onChooseLibrary,
  onMoveLibrary,
  onOpenResetSetup,
}: GeneralSettingsSectionProps) {
  return (
    <div id="section-data-store" className="section-panel general-panel">
      <div className="section-heading">
        <SlidersHorizontal size={18} />
        <div>
          <h2>{copy.general}</h2>
          <p>{copy.generalDescription}</p>
        </div>
      </div>

      <div className="settings-group">
        <div className="group-heading">
          <Languages size={16} />
          <h3>{copy.language}</h3>
        </div>
        <label className="field compact">
          <span>{copy.displayLanguage}</span>
          <select value={settings.language} disabled={disabled} onChange={onLanguageChange}>
            <option value="en">{copy.english}</option>
            <option value="ja">{copy.japanese}</option>
          </select>
        </label>
      </div>

      <div className="settings-group">
        <div className="group-heading">
          <Monitor size={16} />
          <h3>{copy.startupAndResident}</h3>
        </div>
        <p className="muted">{copy.startupAndResidentDescription}</p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.launchOnStartup}
            disabled={shellDisabled}
            data-setting="launchOnStartup"
            onChange={onBooleanSettingChange}
          />
          <span>{copy.launchOnStartup}</span>
        </label>
        <label className="field compact">
          <span>{copy.residentMode}</span>
          <select
            value={settings.residentMode}
            disabled={shellDisabled}
            onChange={onResidentModeChange}
          >
            <option value="tray">{residentModeLabels.tray}</option>
            <option value="taskbar">{residentModeLabels.taskbar}</option>
          </select>
        </label>
        <div className="resident-mode-hint">
          <PanelTop size={15} />
          <span>{settings.residentMode === 'tray' ? copy.trayModeHint : copy.taskbarModeHint}</span>
        </div>
      </div>

      <div className="settings-group">
        <div className="group-heading">
          <Database size={16} />
          <h3>{copy.dataStore}</h3>
        </div>
        <p className="muted">{copy.dataStoreHint}</p>
        <label className="field">
          <span>{copy.dataStoreLocation}</span>
          <input value={dataStoreRoot} disabled readOnly />
        </label>
        <div className="button-row">
          <button type="button" onClick={onMoveDataStore} disabled={disabled}>
            <Folder size={15} />
            {copy.moveDataStore}
          </button>
          <button type="button" onClick={onImportDb} disabled={disabled}>
            <Upload size={15} />
            {copy.import}
          </button>
          <button type="button" onClick={onExportDb} disabled={disabled}>
            <Download size={15} />
            {copy.export}
          </button>
        </div>
        <details className="advanced-settings">
          <summary>{copy.advancedDataStore}</summary>
          <p>{copy.advancedDataStoreDescription}</p>
          <label className="field">
            <span>{copy.sqliteDb}</span>
            <div className="path-row">
              <input
                value={settings.dbPath}
                disabled={disabled}
                data-setting="dbPath"
                onChange={onTextSettingChange}
              />
              <button
                type="button"
                className="icon-button"
                onClick={onChooseDb}
                disabled={disabled}
                title={copy.chooseDatabase}
              >
                <Folder size={15} />
              </button>
            </div>
          </label>
          <div className="button-row single">
            <button type="button" onClick={onMoveDb} disabled={disabled}>
              <Folder size={15} />
              {copy.moveDatabase}
            </button>
          </div>
          <label className="field">
            <span>{copy.libraryPath}</span>
            <div className="path-row">
              <input
                value={settings.libraryPath}
                disabled={disabled}
                data-setting="libraryPath"
                onChange={onTextSettingChange}
              />
              <button
                type="button"
                className="icon-button"
                onClick={onChooseLibrary}
                disabled={disabled}
                title={copy.chooseLibraryFolder}
              >
                <Folder size={15} />
              </button>
            </div>
          </label>
          <div className="button-row single">
            <button type="button" onClick={onMoveLibrary} disabled={disabled}>
              <Folder size={15} />
              {copy.moveLibrary}
            </button>
          </div>
        </details>
        <button
          type="button"
          className="link-button"
          onClick={onOpenResetSetup}
          disabled={disabled}
        >
          <RefreshCcw size={15} />
          {copy.resetSetup}
        </button>
      </div>

      <div className="settings-group">
        <div className="group-heading">
          <Globe2 size={16} />
          <h3>{copy.network}</h3>
        </div>
        <p className="muted">{copy.networkDescription}</p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.allowExternalNetwork}
            disabled={disabled}
            data-setting="allowExternalNetwork"
            onChange={onBooleanSettingChange}
          />
          <span>{copy.allowExternalNetwork}</span>
        </label>

        {settings.allowExternalNetwork ? (
          <>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.basicAuthEnabled}
                disabled={disabled}
                data-setting="basicAuthEnabled"
                onChange={onBooleanSettingChange}
              />
              <span>{copy.requireBasicAuth}</span>
            </label>
            <p className="muted">{copy.requireBasicAuthHint}</p>
            {settings.basicAuthEnabled ? (
              <div className="auth-grid">
                <label className="field compact">
                  <span>{copy.user}</span>
                  <input
                    value={settings.basicAuthUsername}
                    disabled={disabled}
                    data-setting="basicAuthUsername"
                    onChange={onTextSettingChange}
                  />
                </label>
                <label className="field compact">
                  <span>{copy.password}</span>
                  <input
                    type="password"
                    value={settings.basicAuthPassword}
                    disabled={disabled}
                    data-setting="basicAuthPassword"
                    onChange={onTextSettingChange}
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        <details className="advanced-settings">
          <summary>{copy.advancedSharing}</summary>
          <p>{copy.advancedSharingDescription}</p>
          <label className="field compact">
            <span>{copy.port}</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={settings.port}
              disabled={disabled}
              onChange={onPortChange}
            />
          </label>
        </details>
      </div>
    </div>
  );
}
