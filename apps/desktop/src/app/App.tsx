import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Circle,
  Database,
  FileText,
  Film,
  Play,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react';
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AutoTagInstallDialog } from '../features/autotag/AutoTagInstallDialog';
import {
  type AutoTagSettingsCopy,
  AutoTagSettingsSection,
} from '../features/autotag/AutoTagSettingsSection';
import { MediaDependencySection } from '../features/media/MediaDependencySection';
import { DockerMigrationPanel } from '../features/migrations/docker/DockerMigrationPanel';
import type { DockerMigrationCopy } from '../features/migrations/docker/types';
import { StandaloneMigrationDialog } from '../features/migrations/standalone/StandaloneMigrationDialog';
import { StandaloneMigrationPanel } from '../features/migrations/standalone/StandaloneMigrationPanel';
import type {
  StandaloneMigrationCopy,
  StandaloneMigrationProgress,
  StandaloneMigrationStatus,
} from '../features/migrations/standalone/types';
import {
  type GeneralSettingsCopy,
  GeneralSettingsSection,
} from '../features/settings/GeneralSettingsSection';
import { SetupWizard } from '../features/setup/SetupWizard';
import { AppHeader } from './components/AppHeader';
import { ResetSetupDialog } from './components/ResetSetupDialog';
import { SettingsSidebar } from './components/SettingsSidebar';
import { defaultStatus } from './constants';
import {
  isAppLanguage,
  isBooleanSettingKey,
  isDockerTextSettingKey,
  isResidentMode,
  isTextSettingKey,
} from './guards';
import { translations } from './translations';
import type {
  AppLanguage,
  AppSettings,
  AutoTagInstallMetadata,
  AutoTagInstallProgress,
  AutoTagInstallStep,
  AutoTagStatus,
  DockerMigrationProgress,
  DockerSourceDetection,
  FfmpegCandidate,
  PdfRasterizerCandidate,
  SidecarStatus,
} from './types';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const choosePath = async (directory: boolean) => {
  const selected = await open({ directory, multiple: false });
  return typeof selected === 'string' ? selected : null;
};

const getInitialLanguage = (): AppLanguage =>
  navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';

const normalizeSettingsForSave = (settings: AppSettings): AppSettings => ({
  ...settings,
  port: Number(settings.port),
  autoTagPort: Number(settings.autoTagPort),
  autoTagThreshold: Number(settings.autoTagThreshold),
});

const createStandaloneMigrationErrorStatus = (
  settings: AppSettings,
  error: unknown
): StandaloneMigrationStatus => ({
  status: 'history_mismatch',
  dbPath: settings.dbPath,
  currentVersion: null,
  latestVersion: null,
  appliedCount: 0,
  pending: [],
  legacyBaseline: false,
  requiresBackup: false,
  backupPath: null,
  message: getErrorMessage(error),
  error: getErrorMessage(error),
});

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<SidecarStatus>(defaultStatus);
  const [autoTagStatus, setAutoTagStatus] = useState<AutoTagStatus | null>(null);
  const [autoTagInstallStep, setAutoTagInstallStep] = useState<AutoTagInstallStep>(null);
  const [autoTagInstallMetadata, setAutoTagInstallMetadata] =
    useState<AutoTagInstallMetadata | null>(null);
  const [autoTagInstallProgress, setAutoTagInstallProgress] =
    useState<AutoTagInstallProgress | null>(null);
  const [dockerDetection, setDockerDetection] = useState<DockerSourceDetection | null>(null);
  const [dockerDetectionAttempted, setDockerDetectionAttempted] = useState(false);
  const [dockerMigrationProgress, setDockerMigrationProgress] =
    useState<DockerMigrationProgress | null>(null);
  const [standaloneMigrationStatus, setStandaloneMigrationStatus] =
    useState<StandaloneMigrationStatus | null>(null);
  const [standaloneMigrationProgress, setStandaloneMigrationProgress] =
    useState<StandaloneMigrationProgress | null>(null);
  const [standaloneMigrationDialogOpen, setStandaloneMigrationDialogOpen] = useState(false);
  const [ffmpegCandidates, setFfmpegCandidates] = useState<FfmpegCandidate[]>([]);
  const [pdfRasterizerCandidates, setPdfRasterizerCandidates] = useState<PdfRasterizerCandidate[]>(
    []
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [localIp, setLocalIp] = useState<string>('');
  const settingsRef = useRef<AppSettings | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const startAfterStandaloneMigrationRef = useRef<AppSettings | null>(null);
  const standaloneMigrationCompletionHandledRef = useRef(false);

  const language = settings?.language ?? getInitialLanguage();
  const t = translations[language];
  const generalSettingsCopy = useMemo<GeneralSettingsCopy>(
    () => ({
      general: t.general,
      generalDescription: t.generalDescription,
      language: t.language,
      displayLanguage: t.displayLanguage,
      english: t.english,
      japanese: t.japanese,
      startupAndResident: t.startupAndResident,
      startupAndResidentDescription: t.startupAndResidentDescription,
      launchOnStartup: t.launchOnStartup,
      residentMode: t.residentMode,
      trayModeHint: t.trayModeHint,
      taskbarModeHint: t.taskbarModeHint,
      dataStore: t.dataStore,
      dataStoreHint: t.dataStoreHint,
      dataStoreLocation: t.dataStoreLocation,
      moveDataStore: t.moveDataStore,
      import: t.import,
      export: t.export,
      advancedDataStore: t.advancedDataStore,
      advancedDataStoreDescription: t.advancedDataStoreDescription,
      sqliteDb: t.sqliteDb,
      chooseDatabase: t.chooseDatabase,
      moveDatabase: t.moveDatabase,
      libraryPath: t.libraryPath,
      chooseLibraryFolder: t.chooseLibraryFolder,
      moveLibrary: t.moveLibrary,
      resetSetup: t.resetSetup,
      network: t.network,
      networkDescription: t.networkDescription,
      allowExternalNetwork: t.allowExternalNetwork,
      requireBasicAuth: t.requireBasicAuth,
      requireBasicAuthHint: t.requireBasicAuthHint,
      user: t.user,
      password: t.password,
      advancedSharing: t.advancedSharing,
      advancedSharingDescription: t.advancedSharingDescription,
      port: t.port,
    }),
    [t]
  );
  const standaloneMigrationCopy = useMemo<StandaloneMigrationCopy>(
    () => ({
      title: t.databaseUpdate,
      description: t.databaseUpdateDescription,
      readyTitle: t.databaseUpdateReadyTitle,
      pendingTitle: t.databaseUpdatePendingTitle,
      errorTitle: t.databaseUpdateErrorTitle,
      readyDescription: t.databaseUpdateReadyDescription,
      pendingDescription: t.databaseUpdatePendingDescription,
      errorDescription: t.databaseUpdateErrorDescription,
      check: t.databaseUpdateCheck,
      apply: t.databaseUpdateApply,
      modalTitle: t.databaseUpdateModalTitle,
      modalBody: t.databaseUpdateModalBody,
      backupNotice: t.databaseUpdateBackupNotice,
      pendingList: t.databaseUpdatePendingList,
      currentVersion: t.databaseUpdateCurrentVersion,
      latestVersion: t.databaseUpdateLatestVersion,
      inProgress: t.databaseUpdateInProgress,
      completedTitle: t.databaseUpdateCompletedTitle,
      cancel: t.cancel,
      close: t.close,
      ok: t.ok,
    }),
    [t]
  );
  const autoTagInstallCopy = useMemo(
    () => ({
      introTitle: t.autoTagInstallIntroTitle,
      introLead: t.autoTagInstallIntroLead,
      introDetail: t.autoTagInstallIntroDetail,
      introLocal: t.autoTagInstallIntroLocal,
      introTraining: t.autoTagInstallIntroTraining,
      reference: t.autoTagInstallReference,
      metadataLoading: t.autoTagMetadataLoading,
      downloadConfirmTitle: t.autoTagDownloadConfirmTitle,
      downloadConfirm: t.autoTagDownloadConfirm,
      inProgress: t.autoTagInstallInProgress,
      backgroundContinue: t.autoTagBackgroundContinue,
      continue: t.continue,
      cancel: t.cancel,
      close: t.close,
    }),
    [t]
  );
  const autoTagSettingsCopy = useMemo<AutoTagSettingsCopy>(
    () => ({
      title: t.autotag,
      description: t.autotagDescription,
      enable: t.autoTagEnable,
      threshold: t.autoTagThreshold,
      thresholdLess: t.autoTagThresholdLess,
      thresholdMore: t.autoTagThresholdMore,
      installCompleted: t.autoTagInstallCompleted,
      installInProgress: t.autoTagInstallInProgress,
      check: t.autoTagCheck,
      prepare: t.autoTagPrepare,
      advancedSettings: t.advancedSettings,
      advancedDescription: t.autoTagAdvancedDescription,
      codeFolder: t.autoTagCodeFolder,
      modelFolder: t.autoTagModelFolder,
      chooseCodeFolder: t.chooseAutoTagCodeFolder,
      chooseModelFolder: t.chooseAutoTagModelFolder,
      port: t.autoTagPort,
    }),
    [t]
  );
  const dockerMigrationCopy = useMemo<DockerMigrationCopy>(
    () => ({
      title: t.dockerMigration,
      description: t.dockerMigrationDescription,
      readyTitle: t.migrationReadyTitle,
      waitingTitle: t.migrationWaitingTitle,
      notFoundTitle: t.migrationNotFoundTitle,
      waitingDescription: t.migrationWaitingDescription,
      notFoundDescription: t.migrationNotFoundDescription,
      readyDescription: t.migrationReadyDescription,
      storageLocation: t.storageLocation,
      storageRoot: t.dockerStorageRoot,
      chooseStorageRoot: t.chooseDockerStorageRoot,
      detect: t.detectOldDocker,
      migrate: t.migrateFromDocker,
      inProgress: t.dockerMigrationInProgress,
      advancedSettings: t.advancedSettings,
      advancedDescription: t.advancedSettingsDescription,
      postgresDatabaseUrl: t.postgresDatabaseUrl,
      datasetId: t.datasetId,
      optional: t.optional,
      verifyFileReferences: t.verifyFileReferences,
    }),
    [t]
  );
  const standaloneMigrationRunning = standaloneMigrationProgress?.running ?? false;
  const settingsDisabled = busy || status.running || standaloneMigrationRunning;
  const shellSettingsDisabled = busy || standaloneMigrationRunning;
  const residentModeLabels = useMemo(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    return {
      taskbar: isMac ? t.dockMode : t.taskbarMode,
      tray: isMac ? t.menuBarMode : t.trayMode,
    };
  }, [t]);
  const displayUrl = useMemo(() => {
    if (status.running && settings?.allowExternalNetwork && localIp && localIp !== '127.0.0.1') {
      return `http://${localIp}:${settings.port}`;
    }
    return status.url;
  }, [status.running, status.url, settings?.allowExternalNetwork, settings?.port, localIp]);
  const statusLabel = status.running ? t.runningOn(displayUrl) : t.stopped;
  const headerActionLabel = status.running ? t.stop : t.start;
  const HeaderActionIcon = status.running ? Square : Play;

  const refreshStatus = useCallback(async () => {
    const next = await invoke<SidecarStatus>('sidecar_status');
    setStatus(next);
  }, []);

  const refreshAutoTagStatus = useCallback(async () => {
    const next = await invoke<AutoTagStatus>('autotag_status');
    setAutoTagStatus(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | null = null;

    void listen<SidecarStatus>('sidecar-status-changed', (event) => {
      setStatus(event.payload);
      void refreshAutoTagStatus();
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshAutoTagStatus]);

  const refreshStandaloneMigrationStatus = useCallback(async (targetSettings: AppSettings) => {
    try {
      const next = await invoke<StandaloneMigrationStatus>('standalone_migration_status', {
        settings: targetSettings,
      });
      setStandaloneMigrationStatus(next);
      if (next.status !== 'ready') {
        setStandaloneMigrationDialogOpen(true);
      }
      return next;
    } catch (error) {
      const next = createStandaloneMigrationErrorStatus(targetSettings, error);
      setStandaloneMigrationStatus(next);
      setStandaloneMigrationDialogOpen(true);
      setMessage(next.message);
      return next;
    }
  }, []);

  const refreshStandaloneMigrationProgress = useCallback(async () => {
    const next = await invoke<StandaloneMigrationProgress>('standalone_migration_progress');
    setStandaloneMigrationProgress(next);
    return next;
  }, []);

  const refreshFfmpegCandidates = useCallback(async (targetSettings: AppSettings) => {
    const next = await invoke<FfmpegCandidate[]>('detect_ffmpeg', { settings: targetSettings });
    setFfmpegCandidates(next);
    return next;
  }, []);

  const refreshPdfRasterizerCandidates = useCallback(async (targetSettings: AppSettings) => {
    const next = await invoke<PdfRasterizerCandidate[]>('detect_pdf_rasterizer', {
      settings: targetSettings,
    });
    setPdfRasterizerCandidates(next);
    return next;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistSettings = useCallback(async (targetSettings: AppSettings) => {
    const saved = await invoke<AppSettings>('save_settings', {
      settings: normalizeSettingsForSave(targetSettings),
    });
    settingsRef.current = saved;
    setSettings(saved);
    return saved;
  }, []);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const scheduleSettingsSave = useCallback(
    (targetSettings: AppSettings) => {
      clearAutoSaveTimer();
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        void persistSettings(targetSettings).catch((error: unknown) => {
          setMessage(getErrorMessage(error));
        });
      }, 250);
    },
    [clearAutoSaveTimer, persistSettings]
  );

  useEffect(() => clearAutoSaveTimer, [clearAutoSaveTimer]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const loaded = await invoke<AppSettings>('load_settings');
      settingsRef.current = loaded;
      setSettings(loaded);
      await refreshFfmpegCandidates(loaded);
      await refreshPdfRasterizerCandidates(loaded);
      await refreshStatus();
      await refreshAutoTagStatus();
      if (loaded.setupCompleted) {
        await refreshStandaloneMigrationStatus(loaded);
      }
      const installProgress = await invoke<AutoTagInstallProgress>('autotag_install_progress');
      setAutoTagInstallProgress(installProgress);
      const migrationProgress = await invoke<DockerMigrationProgress>('docker_migration_progress');
      setDockerMigrationProgress(migrationProgress);
      const standaloneProgress = await invoke<StandaloneMigrationProgress>(
        'standalone_migration_progress'
      );
      setStandaloneMigrationProgress(standaloneProgress);
      try {
        const ip = await invoke<string>('local_ip_address');
        setLocalIp(ip);
      } catch {
        // LAN IP の検出に失敗しても致命的ではない
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [
    refreshAutoTagStatus,
    refreshFfmpegCandidates,
    refreshPdfRasterizerCandidates,
    refreshStandaloneMigrationStatus,
    refreshStatus,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const current = settingsRef.current;
      if (!current) return null;
      const next = { ...current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      scheduleSettingsSave(next);
      return next;
    },
    [scheduleSettingsSave]
  );

  const handleTextSettingChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const setting = event.currentTarget.dataset.setting;
      if (isTextSettingKey(setting)) {
        if (isDockerTextSettingKey(setting)) {
          setDockerDetection(null);
          setDockerDetectionAttempted(false);
        }
        patchSettings({ [setting]: event.currentTarget.value });
      }
    },
    [patchSettings]
  );

  const handleBooleanSettingChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const setting = event.currentTarget.dataset.setting;
      if (isBooleanSettingKey(setting)) {
        patchSettings({ [setting]: event.currentTarget.checked });
      }
    },
    [patchSettings]
  );

  const handlePortChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      patchSettings({ port: Number(event.currentTarget.value) });
    },
    [patchSettings]
  );

  const handleLanguageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextLanguage = event.currentTarget.value;
      if (isAppLanguage(nextLanguage)) {
        patchSettings({ language: nextLanguage });
      }
    },
    [patchSettings]
  );

  const handleResidentModeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMode = event.currentTarget.value;
      if (isResidentMode(nextMode)) {
        patchSettings({ residentMode: nextMode });
      }
    },
    [patchSettings]
  );

  const saveSettings = useCallback(async () => {
    const current = settingsRef.current;
    if (!current) return null;
    clearAutoSaveTimer();
    return persistSettings(current);
  }, [clearAutoSaveTimer, persistSettings]);

  const startSidecarWithSettings = useCallback(
    async (saved: AppSettings) => {
      const next = await invoke<SidecarStatus>('start_sidecar', { settings: saved });
      setStatus(next);
      const ready = await invoke<boolean>('wait_server_ready', {
        port: saved.port,
        timeoutMs: 60000,
      });
      if (!ready) {
        throw new Error(t.serverReadyTimeout);
      }
      await refreshAutoTagStatus();
    },
    [refreshAutoTagStatus, t.serverReadyTimeout]
  );

  const runAction = useCallback(async (action: () => Promise<unknown>, defaultMessage: string) => {
    setBusy(true);
    setMessage('');
    try {
      const nextMessage = await action();
      setMessage(typeof nextMessage === 'string' ? nextMessage : defaultMessage);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleStart = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved) return;
      const migrationStatus = await refreshStandaloneMigrationStatus(saved);
      if (migrationStatus.status !== 'ready') {
        startAfterStandaloneMigrationRef.current = saved;
        setStandaloneMigrationDialogOpen(true);
        return t.databaseUpdateRequiredMessage;
      }
      await startSidecarWithSettings(saved);
    }, t.appStarted);
  }, [refreshStandaloneMigrationStatus, runAction, saveSettings, startSidecarWithSettings, t]);

  const handleStop = useCallback(() => {
    void runAction(async () => {
      const next = await invoke<SidecarStatus>('stop_sidecar');
      setStatus(next);
      await refreshAutoTagStatus();
    }, t.appStopped);
  }, [refreshAutoTagStatus, runAction, t]);

  const handleToggleSidecar = useCallback(() => {
    if (status.running) {
      handleStop();
      return;
    }
    handleStart();
  }, [handleStart, handleStop, status.running]);

  const handleRefreshStatus = useCallback(() => {
    void runAction(async () => {
      await refreshStatus();
      await refreshAutoTagStatus();
      const current = settingsRef.current;
      if (current) {
        await refreshStandaloneMigrationStatus(current);
      }
    }, t.statusUpdated);
  }, [refreshAutoTagStatus, refreshStandaloneMigrationStatus, refreshStatus, runAction, t]);

  const handleOpenBrowser = useCallback(() => {
    void runAction(async () => {
      if (!status.running) {
        throw new Error(t.appNotRunning);
      }
      await openUrl(displayUrl);
    }, t.openedInBrowser);
  }, [runAction, status.running, displayUrl, t]);

  const handleOpenBrandLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!status.running || busy) return;
      void openUrl(displayUrl);
    },
    [busy, status.running, displayUrl]
  );

  const handleOpenExternalLink = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openUrl(event.currentTarget.href);
  }, []);

  const handleChooseDb = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(false);
      if (path) patchSettings({ dbPath: path });
    }, t.databasePathSelected);
  }, [patchSettings, runAction, t]);

  const handleChooseLibrary = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(true);
      if (path) patchSettings({ libraryPath: path });
    }, t.libraryPathSelected);
  }, [patchSettings, runAction, t]);

  const handleFfmpegSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      patchSettings({ ffmpegPath: event.currentTarget.value });
    },
    [patchSettings]
  );

  const handlePdfRasterizerSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      patchSettings({ pdfRasterizerPath: event.currentTarget.value });
    },
    [patchSettings]
  );

  const handleRefreshFfmpeg = useCallback(() => {
    void runAction(async () => {
      if (!settings) return;
      await refreshFfmpegCandidates(settings);
    }, t.ffmpegChecked);
  }, [refreshFfmpegCandidates, runAction, settings, t]);

  const handleChooseFfmpeg = useCallback(() => {
    void runAction(async () => {
      if (!settings) return;
      const path = await choosePath(false);
      if (!path) return;
      const nextSettings = { ...settings, ffmpegPath: path };
      patchSettings({ ffmpegPath: path });
      await refreshFfmpegCandidates(nextSettings);
    }, t.ffmpegSelected);
  }, [patchSettings, refreshFfmpegCandidates, runAction, settings, t]);

  const handleRefreshPdfRasterizer = useCallback(() => {
    void runAction(async () => {
      if (!settings) return;
      await refreshPdfRasterizerCandidates(settings);
    }, t.pdfChecked);
  }, [refreshPdfRasterizerCandidates, runAction, settings, t]);

  const handleChoosePdfRasterizer = useCallback(() => {
    void runAction(async () => {
      if (!settings) return;
      const path = await choosePath(false);
      if (!path) return;
      const nextSettings = { ...settings, pdfRasterizerPath: path };
      patchSettings({ pdfRasterizerPath: path });
      await refreshPdfRasterizerCandidates(nextSettings);
    }, t.pdfSelected);
  }, [patchSettings, refreshPdfRasterizerCandidates, runAction, settings, t]);

  const handleChooseDockerStorage = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(true);
      if (!path) return;
      try {
        const resolved = await invoke<{ resolved: string; adjusted: boolean; matched: boolean }>(
          'resolve_docker_storage_root',
          { path }
        );
        patchSettings({ dockerStorageRoot: resolved.resolved });
      } catch {
        patchSettings({ dockerStorageRoot: path });
      }
    }, t.dockerStorageRootSelected);
  }, [patchSettings, runAction, t]);

  const handleChooseAutoTagCode = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(true);
      if (path) patchSettings({ autoTagRepoDir: path });
    }, t.autoTagCodeFolderSelected);
  }, [patchSettings, runAction, t]);

  const handleChooseAutoTagModel = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(true);
      if (path) patchSettings({ autoTagModelDir: path });
    }, t.autoTagModelFolderSelected);
  }, [patchSettings, runAction, t]);

  const handleAutoTagPortChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      patchSettings({ autoTagPort: Number(event.currentTarget.value) });
    },
    [patchSettings]
  );

  const handleAutoTagThresholdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      patchSettings({
        autoTagThreshold: 1 - Number(event.currentTarget.value) / 100,
      });
    },
    [patchSettings]
  );

  const handleImportDb = useCallback(() => {
    void runAction(async () => {
      await saveSettings();
      const sourcePath = await choosePath(false);
      if (!sourcePath) return;
      const next = await invoke<AppSettings>('import_database', { sourcePath });
      settingsRef.current = next;
      setSettings(next);
    }, t.databaseImported);
  }, [runAction, saveSettings, t]);

  const handleExportDb = useCallback(() => {
    void runAction(async () => {
      await saveSettings();
      const targetPath = await save({
        defaultPath: 'caramel-board-backup.sqlite',
        filters: [{ name: t.sqliteFilterName, extensions: ['sqlite', 'db'] }],
      });
      if (!targetPath) return;
      await invoke<void>('export_database', { targetPath });
    }, t.databaseExported);
  }, [runAction, saveSettings, t]);

  const handleMoveDb = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved) return;
      const targetPath = await save({
        defaultPath: saved.dbPath || 'caramel-board.sqlite',
        filters: [{ name: t.sqliteFilterName, extensions: ['sqlite', 'db'] }],
      });
      if (!targetPath) return;
      const next = await invoke<AppSettings>('move_database', { targetPath });
      settingsRef.current = next;
      setSettings(next);
    }, t.databaseMoved);
  }, [runAction, saveSettings, t]);

  const handleMoveLibrary = useCallback(() => {
    void runAction(async () => {
      await saveSettings();
      const targetPath = await choosePath(true);
      if (!targetPath) return;
      const next = await invoke<AppSettings>('move_library', { targetPath });
      settingsRef.current = next;
      setSettings(next);
    }, t.libraryMoved);
  }, [runAction, saveSettings, t]);

  const handleMoveDataStore = useCallback(() => {
    void runAction(async () => {
      await saveSettings();
      const targetPath = await choosePath(true);
      if (!targetPath) return;
      const next = await invoke<AppSettings>('apply_data_store', {
        rootPath: targetPath,
        resetExisting: false,
        setupCompleted: true,
        carryExistingData: true,
      });
      settingsRef.current = next;
      setSettings(next);
    }, t.dataStoreMoved);
  }, [runAction, saveSettings, t]);

  const [resetSetupOpen, setResetSetupOpen] = useState(false);

  const handleOpenResetSetup = useCallback(() => {
    setMessage('');
    setResetSetupOpen(true);
  }, []);

  const handleCancelResetSetup = useCallback(() => {
    setResetSetupOpen(false);
  }, []);

  const handleConfirmResetSetup = useCallback(() => {
    void runAction(async () => {
      const next = await invoke<AppSettings>('reset_setup');
      settingsRef.current = next;
      setSettings(next);
      setResetSetupOpen(false);
      return t.resetSetupDone;
    }, t.resetSetupDone);
  }, [runAction, t]);

  const handleRefreshAutoTagStatus = useCallback(() => {
    void runAction(async () => {
      await refreshAutoTagStatus();
    }, t.autoTagChecked);
  }, [refreshAutoTagStatus, runAction, t]);

  const refreshAutoTagInstallProgress = useCallback(async () => {
    const next = await invoke<AutoTagInstallProgress>('autotag_install_progress');
    setAutoTagInstallProgress(next);
    if (next.completed) {
      const loaded = await invoke<AppSettings>('load_settings');
      settingsRef.current = loaded;
      setSettings(loaded);
      await refreshAutoTagStatus();
      setMessage(t.autoTagInstallCompleted);
    }
    return next;
  }, [refreshAutoTagStatus, t.autoTagInstallCompleted]);

  const refreshDockerMigrationProgress = useCallback(async () => {
    const next = await invoke<DockerMigrationProgress>('docker_migration_progress');
    setDockerMigrationProgress(next);
    if (next.completed && !next.error) {
      const loaded = await invoke<AppSettings>('load_settings');
      settingsRef.current = loaded;
      setSettings(loaded);
      setMessage(t.dockerMigrationCompleted(next.dbPath ?? '', next.exportDir ?? ''));
    } else if (next.error) {
      setMessage(next.error);
    }
    return next;
  }, [t]);

  const handleOpenStandaloneMigrationDialog = useCallback(() => {
    setMessage('');
    setStandaloneMigrationDialogOpen(true);
  }, []);

  const handleCloseStandaloneMigrationDialog = useCallback(() => {
    if (standaloneMigrationProgress?.running) return;
    startAfterStandaloneMigrationRef.current = null;
    if (standaloneMigrationProgress?.completed) {
      setStandaloneMigrationProgress(null);
    }
    setStandaloneMigrationDialogOpen(false);
  }, [standaloneMigrationProgress?.completed, standaloneMigrationProgress?.running]);

  const handleRefreshStandaloneMigration = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved) return;
      const next = await refreshStandaloneMigrationStatus(saved);
      if (next.status === 'ready') return t.databaseUpdateReadyDescription;
      setStandaloneMigrationDialogOpen(true);
      return next.message;
    }, t.statusUpdated);
  }, [refreshStandaloneMigrationStatus, runAction, saveSettings, t]);

  const handleApplyStandaloneMigration = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved) return;
      standaloneMigrationCompletionHandledRef.current = false;
      setStandaloneMigrationDialogOpen(true);
      const progress = await invoke<StandaloneMigrationProgress>('start_standalone_migration', {
        settings: saved,
      });
      setStandaloneMigrationProgress(progress);
      return t.databaseUpdateInProgress;
    }, t.databaseUpdateCompleted(''));
  }, [runAction, saveSettings, t]);

  const handleOpenAutoTagInstallDialog = useCallback(() => {
    setMessage('');
    setAutoTagInstallMetadata(null);
    setAutoTagInstallStep('intro');
  }, []);

  const handleCancelAutoTagInstallDialog = useCallback(() => {
    setAutoTagInstallStep(null);
  }, []);

  const handleContinueAutoTagInstallIntro = useCallback(() => {
    void runAction(async () => {
      try {
        const saved = await saveSettings();
        if (!saved) return;
        setAutoTagInstallStep('metadata');
        const metadata = await invoke<AutoTagInstallMetadata>('autotag_install_metadata', {
          settings: saved,
        });
        setAutoTagInstallMetadata(metadata);
        setAutoTagInstallStep('confirm');
        return '';
      } catch (error) {
        setAutoTagInstallStep(null);
        throw error;
      }
    }, '');
  }, [runAction, saveSettings]);

  const handleStartAutoTagInstall = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved || !autoTagInstallMetadata) return;
      const progress = await invoke<AutoTagInstallProgress>('start_autotag_install', {
        settings: saved,
        metadata: autoTagInstallMetadata,
      });
      setAutoTagInstallProgress(progress);
      setAutoTagInstallStep('progress');
      return t.autoTagDownloadStarted;
    }, t.autoTagDownloadStarted);
  }, [autoTagInstallMetadata, runAction, saveSettings, t]);

  const handleDismissAutoTagProgress = useCallback(() => {
    setAutoTagInstallStep(null);
  }, []);

  const detectDockerSource = useCallback(async () => {
    if (!settings) return null;
    setDockerDetectionAttempted(true);
    const result = await invoke<DockerSourceDetection>('detect_docker_source', { settings });
    setDockerDetection(result);
    if (result.storageRoot.trim() && result.storageRoot !== settings.dockerStorageRoot) {
      patchSettings({ dockerStorageRoot: result.storageRoot });
    }
    return result;
  }, [patchSettings, settings]);

  const handleDetectDockerSource = useCallback(() => {
    void runAction(async () => {
      const result = await detectDockerSource();
      if (!result) return;
      if (!result.available) return t.dockerNotDetectedMessage;
      return t.dockerDetectedMessage(result.datasetCount, result.stackCount, result.assetCount);
    }, t.dockerDetectionCompleted);
  }, [detectDockerSource, runAction, t]);

  const handleMigrateFromDocker = useCallback(() => {
    void runAction(async () => {
      const saved = await saveSettings();
      if (!saved) return;
      setDockerMigrationProgress({
        running: true,
        completed: false,
        phase: 'starting',
        message: t.dockerMigrationInProgress,
        percent: 0,
        lastLog: '',
        exportDir: null,
        dbPath: saved.dbPath,
        error: null,
      });
      try {
        const progress = await invoke<DockerMigrationProgress>('start_docker_migration', {
          settings: saved,
        });
        setDockerMigrationProgress(progress);
        return t.dockerMigrationInProgress;
      } catch (error) {
        await refreshDockerMigrationProgress().catch(() => undefined);
        throw error;
      }
    }, t.dockerMigrationCompletedSummary);
  }, [refreshDockerMigrationProgress, runAction, saveSettings, t]);

  const navJumpItems = useMemo(
    () => [
      { id: 'section-data-store', label: t.general, icon: SlidersHorizontal },
      { id: 'section-media', label: t.media, icon: Film },
      { id: 'section-poppler', label: t.poppler, icon: FileText },
      { id: 'section-autotag', label: t.autotag, icon: Sparkles },
      { id: 'section-migration', label: t.migration, icon: Database },
    ],
    [t]
  );

  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const dataStoreRoot = useMemo(() => {
    const dbPath = settings?.dbPath ?? '';
    if (!dbPath) return '';
    const sepIndex = Math.max(dbPath.lastIndexOf('/'), dbPath.lastIndexOf('\\'));
    return sepIndex > 0 ? dbPath.slice(0, sepIndex) : dbPath;
  }, [settings?.dbPath]);

  const autoTagTitle = useMemo(() => {
    if (autoTagStatus?.running) return t.autoTagRunningTitle;
    if (autoTagStatus?.starting) return t.autoTagStartingTitle;
    if (!autoTagStatus?.ready) return t.autoTagMissingTitle;
    if (!settings?.autoTagEnabled) return t.autoTagOffTitle;
    return t.autoTagReadyTitle;
  }, [autoTagStatus, settings?.autoTagEnabled, t]);

  const autoTagDescription = useMemo(() => {
    if (!autoTagStatus?.ready) return t.autoTagSetupDescription;
    if (!settings?.autoTagEnabled) return t.autoTagOffDescription;
    if (autoTagStatus?.ready) return autoTagStatus.message || t.autoTagReadyDescription;
    return t.autoTagReadyDescription;
  }, [autoTagStatus, settings?.autoTagEnabled, t]);

  const autoTagStatusClass = useMemo(() => {
    if (autoTagStatus?.starting) return 'migration-status waiting';
    if (autoTagStatus?.running || (settings?.autoTagEnabled && autoTagStatus?.ready)) {
      return 'migration-status ready';
    }
    if (!autoTagStatus?.ready) return 'migration-status missing';
    return 'migration-status waiting';
  }, [autoTagStatus, settings?.autoTagEnabled]);

  const selectedFfmpegCandidate = useMemo(() => {
    if (!settings?.ffmpegPath) {
      return ffmpegCandidates.find((candidate) => candidate.valid) ?? null;
    }
    return (
      ffmpegCandidates.find((candidate) => candidate.path === settings.ffmpegPath) ??
      ffmpegCandidates.find((candidate) => candidate.valid) ??
      null
    );
  }, [ffmpegCandidates, settings?.ffmpegPath]);

  const ffmpegStatusClass = useMemo(
    () => (selectedFfmpegCandidate?.valid ? 'migration-status ready' : 'migration-status missing'),
    [selectedFfmpegCandidate]
  );

  const selectedPdfRasterizerCandidate = useMemo(() => {
    if (!settings?.pdfRasterizerPath) {
      return pdfRasterizerCandidates.find((candidate) => candidate.valid) ?? null;
    }
    return (
      pdfRasterizerCandidates.find((candidate) => candidate.path === settings.pdfRasterizerPath) ??
      pdfRasterizerCandidates.find((candidate) => candidate.valid) ??
      null
    );
  }, [pdfRasterizerCandidates, settings?.pdfRasterizerPath]);

  const pdfRasterizerStatusClass = useMemo(
    () =>
      selectedPdfRasterizerCandidate?.valid ? 'migration-status ready' : 'migration-status missing',
    [selectedPdfRasterizerCandidate]
  );

  const standaloneMigrationCanApply = useMemo(
    () =>
      Boolean(
        standaloneMigrationStatus &&
          standaloneMigrationStatus.status === 'pending' &&
          !status.running &&
          !standaloneMigrationProgress?.running
      ),
    [standaloneMigrationProgress?.running, standaloneMigrationStatus, status.running]
  );

  useEffect(() => {
    if (!autoTagInstallProgress?.running) return;

    const timer = window.setInterval(() => {
      void refreshAutoTagInstallProgress();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoTagInstallProgress?.running, refreshAutoTagInstallProgress]);

  useEffect(() => {
    if (!autoTagStatus?.starting) return;

    const timer = window.setInterval(() => {
      void refreshAutoTagStatus();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoTagStatus?.starting, refreshAutoTagStatus]);

  useEffect(() => {
    if (!dockerMigrationProgress?.running) return;

    const timer = window.setInterval(() => {
      void refreshDockerMigrationProgress();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [dockerMigrationProgress?.running, refreshDockerMigrationProgress]);

  useEffect(() => {
    if (!standaloneMigrationProgress?.running) return;

    const timer = window.setInterval(() => {
      void refreshStandaloneMigrationProgress();
    }, 800);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStandaloneMigrationProgress, standaloneMigrationProgress?.running]);

  useEffect(() => {
    if (
      !standaloneMigrationProgress?.completed ||
      standaloneMigrationProgress.error ||
      standaloneMigrationCompletionHandledRef.current
    ) {
      return;
    }
    standaloneMigrationCompletionHandledRef.current = true;
    void (async () => {
      const loaded = await invoke<AppSettings>('load_settings');
      settingsRef.current = loaded;
      setSettings(loaded);
      const migrationStatus = await refreshStandaloneMigrationStatus(loaded);
      if (migrationStatus.status !== 'ready') {
        setStandaloneMigrationDialogOpen(true);
        setMessage(migrationStatus.message);
        return;
      }
      setStandaloneMigrationDialogOpen(true);
      const backupPath = standaloneMigrationProgress.backupPath ?? '';
      const pendingStart = startAfterStandaloneMigrationRef.current;
      startAfterStandaloneMigrationRef.current = null;
      if (pendingStart) {
        await startSidecarWithSettings(pendingStart);
        setMessage(t.appStarted);
      } else {
        setMessage(t.databaseUpdateCompleted(backupPath));
      }
    })().catch((error: unknown) => {
      setMessage(getErrorMessage(error));
    });
  }, [
    refreshStandaloneMigrationStatus,
    standaloneMigrationProgress?.backupPath,
    standaloneMigrationProgress?.completed,
    standaloneMigrationProgress?.error,
    startSidecarWithSettings,
    t,
  ]);

  if (!settings) {
    return (
      <main className="settings-shell loading-shell">
        <div className="loading-panel">{t.loadingSettings}</div>
      </main>
    );
  }

  if (!settings.setupCompleted) {
    const sepIndex = Math.max(settings.dbPath.lastIndexOf('/'), settings.dbPath.lastIndexOf('\\'));
    const defaultRoot =
      sepIndex > 0 ? settings.dbPath.slice(0, sepIndex) : settings.libraryPath || settings.dbPath;
    return (
      <SetupWizard
        language={language}
        initialSettings={settings}
        defaultDataStoreRoot={defaultRoot}
        onLanguageChange={(next) => {
          patchSettings({ language: next });
          // ウィザード内の後続ステップがディスクの設定を読むため、デバウンスを待たず即時保存する
          void saveSettings().catch((error: unknown) => {
            setMessage(getErrorMessage(error));
          });
        }}
        onComplete={(applied) => {
          settingsRef.current = applied as AppSettings;
          setSettings(applied as AppSettings);
          void refreshStatus();
          void refreshAutoTagStatus();
          void refreshStandaloneMigrationStatus(applied as AppSettings);
        }}
      />
    );
  }

  return (
    <main className="settings-shell">
      <AppHeader
        running={status.running}
        displayUrl={displayUrl}
        busy={busy}
        openBrowserLabel={t.openBrowser}
        refreshStatusLabel={t.refreshStatus}
        actionLabel={headerActionLabel}
        ActionIcon={HeaderActionIcon}
        onRefreshStatus={handleRefreshStatus}
        onOpenBrowser={handleOpenBrowser}
        onToggleSidecar={handleToggleSidecar}
        onOpenBrandLink={handleOpenBrandLink}
        onOpenExternalLink={handleOpenExternalLink}
      />

      <SettingsSidebar label={t.settingsNavigation} items={navJumpItems} onJump={scrollToSection} />

      <section className="settings-content" aria-disabled={settingsDisabled}>
        <div className={status.running ? 'status-banner running' : 'status-banner'}>
          <span className={status.running ? 'status-pill running' : 'status-pill'}>
            <Circle size={10} fill="currentColor" />
            {statusLabel}
          </span>
          {status.running ? (
            <span className="status-banner-message">{t.lockedWhileRunning}</span>
          ) : null}
          {autoTagStatus?.enabled || autoTagStatus?.running || autoTagStatus?.starting ? (
            <span className={autoTagStatus.running ? 'status-pill running' : 'status-pill'}>
              <Sparkles size={10} fill="currentColor" />
              {autoTagStatus.running
                ? t.autoTagRunningTitle
                : autoTagStatus.starting
                  ? t.autoTagStartingTitle
                  : t.autotag}
            </span>
          ) : null}
        </div>

        <GeneralSettingsSection
          settings={settings}
          dataStoreRoot={dataStoreRoot}
          copy={generalSettingsCopy}
          disabled={settingsDisabled}
          shellDisabled={shellSettingsDisabled}
          residentModeLabels={residentModeLabels}
          onLanguageChange={handleLanguageChange}
          onResidentModeChange={handleResidentModeChange}
          onBooleanSettingChange={handleBooleanSettingChange}
          onTextSettingChange={handleTextSettingChange}
          onPortChange={handlePortChange}
          onMoveDataStore={handleMoveDataStore}
          onImportDb={handleImportDb}
          onExportDb={handleExportDb}
          onChooseDb={handleChooseDb}
          onMoveDb={handleMoveDb}
          onChooseLibrary={handleChooseLibrary}
          onMoveLibrary={handleMoveLibrary}
          onOpenResetSetup={handleOpenResetSetup}
        />

        <MediaDependencySection
          id="section-media"
          Icon={Film}
          title={t.media}
          description={t.mediaDescription}
          groupTitle={t.ffmpeg}
          pathLabel={t.ffmpegPath}
          autoDetectLabel={t.ffmpegAutoDetect}
          readyTitle={t.ffmpegReadyTitle}
          missingTitle={t.ffmpegMissingTitle}
          readyDescription={t.ffmpegReadyDescription}
          missingDescription={t.ffmpegMissingDescription}
          candidatesLabel={t.ffmpegCandidates}
          noCandidatesLabel={t.ffmpegNoCandidates}
          refreshLabel={t.refreshFfmpeg}
          chooseLabel={t.chooseFfmpeg}
          statusClass={ffmpegStatusClass}
          selectedCandidate={selectedFfmpegCandidate}
          candidates={ffmpegCandidates}
          value={settings.ffmpegPath}
          disabled={settingsDisabled}
          onSelectChange={handleFfmpegSelectChange}
          onRefresh={handleRefreshFfmpeg}
          onChoose={handleChooseFfmpeg}
        />

        <MediaDependencySection
          id="section-poppler"
          Icon={FileText}
          title={t.poppler}
          description={t.popplerDescription}
          groupTitle={t.pdf}
          pathLabel={t.pdfRasterizerPath}
          autoDetectLabel={t.pdfRasterizerAutoDetect}
          readyTitle={t.pdfReadyTitle}
          missingTitle={t.pdfMissingTitle}
          readyDescription={t.pdfReadyDescription}
          missingDescription={t.pdfMissingDescription}
          candidatesLabel={t.pdfCandidates}
          noCandidatesLabel={t.pdfNoCandidates}
          refreshLabel={t.refreshPdfRasterizer}
          chooseLabel={t.choosePdfRasterizer}
          statusClass={pdfRasterizerStatusClass}
          selectedCandidate={selectedPdfRasterizerCandidate}
          candidates={pdfRasterizerCandidates}
          value={settings.pdfRasterizerPath}
          disabled={settingsDisabled}
          onSelectChange={handlePdfRasterizerSelectChange}
          onRefresh={handleRefreshPdfRasterizer}
          onChoose={handleChoosePdfRasterizer}
        />

        <AutoTagSettingsSection
          settings={settings}
          status={autoTagStatus}
          installProgress={autoTagInstallProgress}
          copy={autoTagSettingsCopy}
          disabled={settingsDisabled}
          busy={busy}
          statusClass={autoTagStatusClass}
          statusTitle={autoTagTitle}
          statusDescription={autoTagDescription}
          onBooleanSettingChange={handleBooleanSettingChange}
          onTextSettingChange={handleTextSettingChange}
          onThresholdChange={handleAutoTagThresholdChange}
          onRefreshStatus={handleRefreshAutoTagStatus}
          onOpenInstallDialog={handleOpenAutoTagInstallDialog}
          onChooseCodeFolder={handleChooseAutoTagCode}
          onChooseModelFolder={handleChooseAutoTagModel}
          onPortChange={handleAutoTagPortChange}
        />

        <div id="section-migration" className="section-panel">
          <div className="section-heading">
            <Database size={18} />
            <div>
              <h2>{t.migration}</h2>
              <p>{t.migrationDescription}</p>
            </div>
          </div>

          <StandaloneMigrationPanel
            status={standaloneMigrationStatus}
            progress={standaloneMigrationProgress}
            copy={standaloneMigrationCopy}
            busy={busy || standaloneMigrationRunning}
            canApply={standaloneMigrationCanApply}
            onRefresh={handleRefreshStandaloneMigration}
            onOpenDialog={handleOpenStandaloneMigrationDialog}
          />

          <DockerMigrationPanel
            settings={settings}
            disabled={settingsDisabled}
            detection={dockerDetection}
            detectionAttempted={dockerDetectionAttempted}
            progress={dockerMigrationProgress}
            copy={dockerMigrationCopy}
            onChooseStorage={handleChooseDockerStorage}
            onDetect={handleDetectDockerSource}
            onMigrate={handleMigrateFromDocker}
            onTextSettingChange={handleTextSettingChange}
            onBooleanSettingChange={handleBooleanSettingChange}
          />
        </div>

        <footer className="settings-footer">
          <span className="auto-save-note">{t.settingsAutoSaved}</span>
          {message ? <div className="message-box">{message}</div> : null}
        </footer>
      </section>

      {standaloneMigrationDialogOpen ? (
        <StandaloneMigrationDialog
          status={standaloneMigrationStatus}
          progress={standaloneMigrationProgress}
          copy={standaloneMigrationCopy}
          canApply={standaloneMigrationCanApply}
          onApply={handleApplyStandaloneMigration}
          onClose={handleCloseStandaloneMigrationDialog}
        />
      ) : null}

      {resetSetupOpen ? (
        <ResetSetupDialog
          title={t.resetSetupConfirmTitle}
          body={t.resetSetupConfirmBody}
          cancelLabel={t.cancel}
          confirmLabel={t.resetSetup}
          busy={busy}
          onCancel={handleCancelResetSetup}
          onConfirm={handleConfirmResetSetup}
        />
      ) : null}

      <AutoTagInstallDialog
        step={autoTagInstallStep}
        metadata={autoTagInstallMetadata}
        progress={autoTagInstallProgress}
        copy={autoTagInstallCopy}
        busy={busy}
        onCancel={handleCancelAutoTagInstallDialog}
        onContinueIntro={handleContinueAutoTagInstallIntro}
        onStartInstall={handleStartAutoTagInstall}
        onDismissProgress={handleDismissAutoTagProgress}
        onOpenExternalLink={handleOpenExternalLink}
      />
    </main>
  );
}
