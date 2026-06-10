import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Database,
  Download,
  ExternalLink,
  Film,
  Folder,
  Github,
  Globe2,
  KeyRound,
  Languages,
  Megaphone,
  Play,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Twitter,
  Upload,
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
import { CaramelBoardLogo } from './CaramelBoardLogo';

interface AppSettings {
  dbPath: string;
  libraryPath: string;
  language: AppLanguage;
  port: number;
  allowExternalNetwork: boolean;
  basicAuthEnabled: boolean;
  basicAuthUsername: string;
  basicAuthPassword: string;
  dockerDatabaseUrl: string;
  dockerStorageRoot: string;
  dockerDatasetId: string;
  dockerVerifyFiles: boolean;
  autoTagEnabled: boolean;
  autoTagPort: number;
  autoTagRepoDir: string;
  autoTagModelDir: string;
  autoTagThreshold: number;
  ffmpegPath: string;
}

interface SidecarStatus {
  running: boolean;
  url: string;
  pid: number | null;
  startedAt: number | null;
}

interface MigrationResult {
  exportDir: string;
  dbPath: string;
  stdout: string;
}

interface DockerDatasetSummary {
  id: number;
  name: string;
}

interface DockerSourceDetection {
  available: boolean;
  databaseUrl: string;
  storageRoot: string;
  storageRootExists: boolean;
  datasetCount: number;
  stackCount: number;
  assetCount: number;
  datasets: DockerDatasetSummary[];
  message: string;
}

interface AutoTagStatus {
  enabled: boolean;
  running: boolean;
  url: string;
  uvInstalled: boolean;
  repositoryReady: boolean;
  modelReady: boolean;
  ready: boolean;
  message: string;
}

interface AutoTagInstallMetadata {
  modelName: string;
  modelUrl: string;
  downloadBytes: number;
  downloadSize: string;
}

interface AutoTagInstallProgress {
  running: boolean;
  completed: boolean;
  phase: string;
  message: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  error: string | null;
}

interface FfmpegCandidate {
  path: string;
  label: string;
  source: string;
  valid: boolean;
  version: string;
  details: string;
}

type SettingsSection = 'general' | 'media' | 'autotag' | 'migration';
type AppLanguage = 'en' | 'ja';
type AutoTagInstallStep = 'intro' | 'metadata' | 'confirm' | 'progress' | null;
type TextSettingKey =
  | 'dbPath'
  | 'libraryPath'
  | 'basicAuthUsername'
  | 'basicAuthPassword'
  | 'autoTagRepoDir'
  | 'autoTagModelDir'
  | 'ffmpegPath'
  | 'dockerDatabaseUrl'
  | 'dockerStorageRoot'
  | 'dockerDatasetId';
type BooleanSettingKey =
  | 'allowExternalNetwork'
  | 'basicAuthEnabled'
  | 'dockerVerifyFiles'
  | 'autoTagEnabled';

const defaultStatus: SidecarStatus = {
  running: false,
  url: 'http://127.0.0.1:6777',
  pid: null,
  startedAt: null,
};

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';
const APP_GIT_HASH = import.meta.env.VITE_APP_GIT_HASH || 'unknown';
const FANBOX_URL = 'https://na-zu-nya.fanbox.cc/';
const X_URL = 'https://x.com/na_zu_nya';
const GITHUB_URL = 'https://github.com/na-zu-nya/caramel-board';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const choosePath = async (directory: boolean) => {
  const selected = await open({ directory, multiple: false });
  return typeof selected === 'string' ? selected : null;
};

const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  value === 'general' || value === 'media' || value === 'autotag' || value === 'migration';

const isAppLanguage = (value: string | undefined): value is AppLanguage =>
  value === 'en' || value === 'ja';

const isTextSettingKey = (value: string | undefined): value is TextSettingKey =>
  value === 'dbPath' ||
  value === 'libraryPath' ||
  value === 'basicAuthUsername' ||
  value === 'basicAuthPassword' ||
  value === 'autoTagRepoDir' ||
  value === 'autoTagModelDir' ||
  value === 'ffmpegPath' ||
  value === 'dockerDatabaseUrl' ||
  value === 'dockerStorageRoot' ||
  value === 'dockerDatasetId';

const isBooleanSettingKey = (value: string | undefined): value is BooleanSettingKey =>
  value === 'allowExternalNetwork' ||
  value === 'basicAuthEnabled' ||
  value === 'dockerVerifyFiles' ||
  value === 'autoTagEnabled';

const isDockerTextSettingKey = (value: TextSettingKey) =>
  value === 'dockerDatabaseUrl' || value === 'dockerStorageRoot' || value === 'dockerDatasetId';

const getInitialLanguage = (): AppLanguage =>
  navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';

const normalizeSettingsForSave = (settings: AppSettings): AppSettings => ({
  ...settings,
  port: Number(settings.port),
  autoTagPort: Number(settings.autoTagPort),
  autoTagThreshold: Number(settings.autoTagThreshold),
});

const translations = {
  en: {
    loadingSettings: 'Loading settings...',
    refreshStatus: 'Refresh status',
    statusUpdated: 'Status updated.',
    openBrowser: 'Open Browser',
    start: 'Start',
    stop: 'Stop',
    runningOn: (url: string) => `Running on ${url}`,
    stopped: 'Stopped',
    appNotRunning: 'Caramel Board is not running.',
    appActive: 'Caramel Board is running.',
    lockedWhileRunning: 'Stop Caramel Board before changing settings.',
    general: 'General',
    media: 'GIF/Video',
    autotag: 'AutoTag',
    migration: 'Migration',
    settingsNavigation: 'Settings navigation',
    generalDescription:
      'Core standalone settings for database, files, network, and access control.',
    mediaDescription: 'Configure FFmpeg used for GIF and video preview generation.',
    ffmpeg: 'FFmpeg',
    ffmpegPath: 'FFmpeg executable',
    ffmpegAutoDetect: 'Auto detect from PATH',
    chooseFfmpeg: 'Choose ffmpeg',
    refreshFfmpeg: 'Detect FFmpeg',
    ffmpegReadyTitle: 'FFmpeg is ready',
    ffmpegMissingTitle: 'FFmpeg is not configured',
    ffmpegReadyDescription: 'GIF and video previews can be generated with this executable.',
    ffmpegMissingDescription:
      'Install FFmpeg separately, then select ffmpeg from the detected list or browse to it.',
    ffmpegCandidates: 'Detected FFmpeg',
    ffmpegNoCandidates: 'No FFmpeg executable was found on PATH.',
    ffmpegSelected: 'FFmpeg path selected.',
    ffmpegChecked: 'FFmpeg detection completed.',
    autotagDescription: 'Prepare and run local AI tagging for images.',
    autoTagEnable: 'Use AutoTag',
    autoTagReadyTitle: 'AutoTag is ready',
    autoTagRunningTitle: 'AutoTag is running',
    autoTagMissingTitle: 'AutoTag is not installed',
    autoTagOffTitle: 'AutoTag is off',
    autoTagOffDescription: 'Turn it on to start AutoTag together with Caramel Board.',
    autoTagReadyDescription: 'AutoTag can start together with Caramel Board.',
    autoTagSetupDescription: 'Install the model to enable local image tagging.',
    autoTagPrepare: 'Install model',
    autoTagCheck: 'Check AutoTag',
    autoTagPrepared: 'AutoTag was installed and enabled.',
    autoTagChecked: 'AutoTag status updated.',
    autoTagInstallIntroTitle: 'Install AutoTag model',
    autoTagInstallIntroLead: 'AutoTag uses the open-source JoyTag model.',
    autoTagInstallIntroDetail:
      'This feature uses a pre-trained model to generate tags from images.',
    autoTagInstallIntroLocal:
      'All processing runs locally. Images are not transferred outside this computer.',
    autoTagInstallIntroTraining: 'Images used with this feature are not used for training.',
    autoTagInstallReference: 'Reference',
    autoTagMetadataLoading: 'Fetching model metadata...',
    autoTagDownloadConfirmTitle: 'Download model data',
    autoTagDownloadConfirm: (size: string) => `${size} of data will be downloaded. Continue?`,
    autoTagDownloadStarted: 'AutoTag installation started in the background.',
    autoTagInstallCompleted: 'AutoTag installation completed. AutoTag was enabled.',
    autoTagInstallInProgress: 'Installing AutoTag...',
    autoTagBackgroundContinue: 'Continue in background',
    continue: 'Continue',
    cancel: 'Cancel',
    close: 'Close',
    autoTagCodeFolder: 'AutoTag code folder',
    autoTagModelFolder: 'AutoTag model folder',
    chooseAutoTagCodeFolder: 'Choose AutoTag code folder',
    chooseAutoTagModelFolder: 'Choose AutoTag model folder',
    autoTagPort: 'AutoTag port',
    autoTagThreshold: 'Threshold',
    autoTagAdvancedDescription:
      'Usually not needed. Change this only when using a custom JoyTag location or port.',
    autoTagCodeFolderSelected: 'AutoTag code folder selected.',
    autoTagModelFolderSelected: 'AutoTag model folder selected.',
    language: 'Language',
    displayLanguage: 'Display language',
    english: 'English',
    japanese: 'Japanese',
    database: 'Database',
    sqliteDb: 'SQLite DB',
    chooseDatabase: 'Choose database',
    moveDatabase: 'Move database',
    import: 'Import',
    export: 'Export',
    openMigrationSettings: 'Open Docker migration settings',
    files: 'Files',
    libraryPath: 'Library path',
    chooseLibraryFolder: 'Choose library folder',
    moveLibrary: 'Move library',
    network: 'Network',
    allowExternalNetwork: 'Allow access from other devices on the network',
    port: 'Port',
    basicAuth: 'Basic Auth',
    requireBasicAuth: 'Require Basic authentication',
    user: 'User',
    password: 'Password',
    dockerMigration: 'Docker Migration',
    dockerMigrationDescription:
      'Start the old Docker version, then migrate. Caramel Board will find it automatically.',
    detectOldDocker: 'Check old Docker version',
    migrationReadyTitle: 'Old Docker version found',
    migrationWaitingTitle: 'Start the old Docker version',
    migrationWaitingDescription:
      'When it is running and reachable, Caramel Board can migrate your data automatically.',
    migrationNotFoundTitle: 'Could not find the old Docker version',
    migrationNotFoundDescription: 'Start the old Docker version, then check again.',
    migrationReadyDescription: (datasetCount: number, stackCount: number, assetCount: number) =>
      `${datasetCount} libraries / ${stackCount} stacks / ${assetCount} assets`,
    storageLocation: 'File storage',
    advancedSettings: 'Advanced settings',
    advancedSettingsDescription:
      'Usually not needed. Use this only when the old Docker setup uses custom paths.',
    postgresDatabaseUrl: 'PostgreSQL DATABASE_URL',
    dockerStorageRoot: 'Docker storage root',
    chooseDockerStorageRoot: 'Choose Docker storage root',
    datasetId: 'Dataset ID',
    optional: 'optional',
    verifyFileReferences: 'Verify file references',
    migrateFromDocker: 'Migrate',
    appStarted: 'Caramel Board started.',
    appStopped: 'Caramel Board stopped.',
    openedInBrowser: 'Opened in browser.',
    databasePathSelected: 'Database path selected.',
    libraryPathSelected: 'Library path selected.',
    databaseMoved: 'Database moved.',
    libraryMoved: 'Library moved.',
    dockerStorageRootSelected: 'Docker storage root selected.',
    databaseImported: 'Database imported.',
    databaseExported: 'Database exported.',
    dockerDetectedMessage: (datasetCount: number, stackCount: number, assetCount: number) =>
      `Old Docker version found. ${datasetCount} libraries / ${stackCount} stacks / ${assetCount} assets`,
    dockerNotDetectedMessage: 'Old Docker version was not found.',
    dockerDetectionCompleted: 'Docker check completed.',
    dockerMigrationCompletedSummary: 'Docker migration completed.',
    dockerMigrationCompleted: (dbPath: string, exportDir: string) =>
      `Docker migration completed.\nDB: ${dbPath}\nExport: ${exportDir}`,
    settingsAutoSaved: 'Settings are saved automatically.',
    sqliteFilterName: 'SQLite Database',
  },
  ja: {
    loadingSettings: '設定を読み込んでいます...',
    refreshStatus: '状態を更新',
    statusUpdated: '状態を更新しました。',
    openBrowser: 'ブラウザで開く',
    start: '起動',
    stop: '停止',
    runningOn: (url: string) => `起動中: ${url}`,
    stopped: '停止中',
    appNotRunning: 'Caramel Board は停止しています。',
    appActive: 'Caramel Board が起動しています。',
    lockedWhileRunning: '設定を変更するには Caramel Board を停止してください。',
    general: '一般',
    media: 'GIF/動画設定',
    autotag: '自動タグ',
    migration: '移行',
    settingsNavigation: '設定ナビゲーション',
    generalDescription: 'DB、ファイル、ネットワーク、アクセス設定をまとめて管理します。',
    mediaDescription: 'GIF・動画プレビュー生成に使用する FFmpeg を設定します。',
    ffmpeg: 'FFmpeg',
    ffmpegPath: 'FFmpeg 実行ファイル',
    ffmpegAutoDetect: 'PATH から自動検出',
    chooseFfmpeg: 'ffmpeg を選択',
    refreshFfmpeg: 'FFmpeg を検出',
    ffmpegReadyTitle: 'FFmpeg を利用できます',
    ffmpegMissingTitle: 'FFmpeg が設定されていません',
    ffmpegReadyDescription: 'この実行ファイルで GIF・動画プレビューを生成できます。',
    ffmpegMissingDescription:
      'FFmpeg を別途インストールし、検出候補から選ぶか ffmpeg を参照してください。',
    ffmpegCandidates: '検出された FFmpeg',
    ffmpegNoCandidates: 'PATH 上に FFmpeg は見つかりませんでした。',
    ffmpegSelected: 'FFmpeg のパスを選択しました。',
    ffmpegChecked: 'FFmpeg の検出が完了しました。',
    autotagDescription: '画像にAIタグを付けるための準備と起動設定です。',
    autoTagEnable: '自動タグを使う',
    autoTagReadyTitle: '自動タグを利用できます',
    autoTagRunningTitle: '自動タグが起動しています',
    autoTagMissingTitle: '自動タグはインストールされていません',
    autoTagOffTitle: '自動タグはOFFです',
    autoTagOffDescription: 'ONにすると Caramel Board の起動時に自動タグも一緒に起動します。',
    autoTagReadyDescription: 'Caramel Board と一緒に起動できます。',
    autoTagSetupDescription: 'モデルをインストールすると、画像からローカルでタグを生成できます。',
    autoTagPrepare: 'モデルをインストール',
    autoTagCheck: '状態を確認',
    autoTagPrepared: '自動タグをインストールし、有効にしました。',
    autoTagChecked: '自動タグの状態を更新しました。',
    autoTagInstallIntroTitle: '自動タグモデルのインストール',
    autoTagInstallIntroLead: '自動タグにはオープンソースのJoyTagを使用します。',
    autoTagInstallIntroDetail:
      'この機能により、事前に学習されたモデルを使用し、画像のタグを生成します。',
    autoTagInstallIntroLocal:
      '動作は全てローカルで完結し、画像が外部に転送されることはありません。',
    autoTagInstallIntroTraining: 'この機能で使用された画像が学習されることはありません。',
    autoTagInstallReference: '詳細',
    autoTagMetadataLoading: 'メタデータを取得中...',
    autoTagDownloadConfirmTitle: 'モデルのダウンロード',
    autoTagDownloadConfirm: (size: string) => `${size} のデータをダウンロードします。続けますか？`,
    autoTagDownloadStarted: '自動タグのインストールをバックグラウンドで開始しました。',
    autoTagInstallCompleted: '自動タグのインストールが完了しました。自動タグを有効にしました。',
    autoTagInstallInProgress: '自動タグをインストールしています...',
    autoTagBackgroundContinue: 'バックグラウンドで続ける',
    continue: '続ける',
    cancel: 'キャンセル',
    close: '閉じる',
    autoTagCodeFolder: '自動タグのコード保存先',
    autoTagModelFolder: '自動タグのモデル保存先',
    chooseAutoTagCodeFolder: '自動タグのコード保存先を選択',
    chooseAutoTagModelFolder: '自動タグのモデル保存先を選択',
    autoTagPort: '自動タグポート',
    autoTagThreshold: 'しきい値',
    autoTagAdvancedDescription:
      '通常は変更不要です。JoyTagの保存先やポートを変える場合だけ使います。',
    autoTagCodeFolderSelected: '自動タグのコード保存先を選択しました。',
    autoTagModelFolderSelected: '自動タグのモデル保存先を選択しました。',
    language: '言語',
    displayLanguage: '表示言語',
    english: '英語',
    japanese: '日本語',
    database: 'データベース',
    sqliteDb: 'SQLite DB',
    chooseDatabase: 'DBを選択',
    moveDatabase: 'DBを移動',
    import: 'インポート',
    export: 'エクスポート',
    openMigrationSettings: 'Docker版からの移行設定を開く',
    files: 'ファイル',
    libraryPath: 'ライブラリパス',
    chooseLibraryFolder: 'ライブラリフォルダを選択',
    moveLibrary: 'ライブラリを移動',
    network: 'ネットワーク',
    allowExternalNetwork: '同一ネットワーク上の他デバイスからのアクセスを許可',
    port: 'ポート',
    basicAuth: 'Basic認証',
    requireBasicAuth: 'Basic認証を要求する',
    user: 'ユーザー',
    password: 'パスワード',
    dockerMigration: 'Docker版からの移行',
    dockerMigrationDescription:
      '旧Docker版を起動した状態で移行してください。接続先とファイルの場所は自動で探します。',
    detectOldDocker: '旧Docker版を再検出',
    migrationReadyTitle: '旧Docker版が見つかりました',
    migrationWaitingTitle: '旧Docker版を起動してください',
    migrationWaitingDescription: '起動してアクセスできる状態になれば、自動で検出して移行できます。',
    migrationNotFoundTitle: '旧Docker版が見つかりません',
    migrationNotFoundDescription: '旧Docker版を起動してから、もう一度検出してください。',
    migrationReadyDescription: (datasetCount: number, stackCount: number, assetCount: number) =>
      `ライブラリ ${datasetCount}件 / スタック ${stackCount}件 / アセット ${assetCount}件`,
    storageLocation: 'ファイルの場所',
    advancedSettings: '詳細設定',
    advancedSettingsDescription:
      '通常は変更不要です。旧Docker版で保存場所や接続先を変更している場合だけ使います。',
    postgresDatabaseUrl: 'PostgreSQL DATABASE_URL',
    dockerStorageRoot: 'Docker ストレージルート',
    chooseDockerStorageRoot: 'Docker ストレージルートを選択',
    datasetId: 'Dataset ID',
    optional: '任意',
    verifyFileReferences: 'ファイル参照を検証する',
    migrateFromDocker: '移行する',
    appStarted: 'Caramel Board を起動しました。',
    appStopped: 'Caramel Board を停止しました。',
    openedInBrowser: 'ブラウザで開きました。',
    databasePathSelected: 'DBパスを選択しました。',
    libraryPathSelected: 'ライブラリパスを選択しました。',
    databaseMoved: 'DBを移動しました。',
    libraryMoved: 'ライブラリを移動しました。',
    dockerStorageRootSelected: 'Docker ストレージルートを選択しました。',
    databaseImported: 'DBをインポートしました。',
    databaseExported: 'DBをエクスポートしました。',
    dockerDetectedMessage: (datasetCount: number, stackCount: number, assetCount: number) =>
      `旧Docker版が見つかりました。ライブラリ ${datasetCount}件 / スタック ${stackCount}件 / アセット ${assetCount}件`,
    dockerNotDetectedMessage: '旧Docker版が見つかりませんでした。',
    dockerDetectionCompleted: '旧Docker版の確認が完了しました。',
    dockerMigrationCompletedSummary: 'Docker版からの移行が完了しました。',
    dockerMigrationCompleted: (dbPath: string, exportDir: string) =>
      `Docker版からの移行が完了しました。\nDB: ${dbPath}\nExport: ${exportDir}`,
    settingsAutoSaved: '設定は自動保存されます。',
    sqliteFilterName: 'SQLiteデータベース',
  },
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<SidecarStatus>(defaultStatus);
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [autoTagStatus, setAutoTagStatus] = useState<AutoTagStatus | null>(null);
  const [autoTagInstallStep, setAutoTagInstallStep] = useState<AutoTagInstallStep>(null);
  const [autoTagInstallMetadata, setAutoTagInstallMetadata] =
    useState<AutoTagInstallMetadata | null>(null);
  const [autoTagInstallProgress, setAutoTagInstallProgress] =
    useState<AutoTagInstallProgress | null>(null);
  const [dockerDetection, setDockerDetection] = useState<DockerSourceDetection | null>(null);
  const [dockerDetectionAttempted, setDockerDetectionAttempted] = useState(false);
  const [ffmpegCandidates, setFfmpegCandidates] = useState<FfmpegCandidate[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const settingsRef = useRef<AppSettings | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  const language = settings?.language ?? getInitialLanguage();
  const t = translations[language];
  const settingsDisabled = busy || status.running;
  const statusLabel = status.running ? t.runningOn(status.url) : t.stopped;
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

  const refreshFfmpegCandidates = useCallback(async (targetSettings: AppSettings) => {
    const next = await invoke<FfmpegCandidate[]>('detect_ffmpeg', { settings: targetSettings });
    setFfmpegCandidates(next);
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
      await refreshStatus();
      await refreshAutoTagStatus();
      const installProgress = await invoke<AutoTagInstallProgress>('autotag_install_progress');
      setAutoTagInstallProgress(installProgress);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [refreshAutoTagStatus, refreshFfmpegCandidates, refreshStatus]);

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

  const handleSelectSection = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    const section = event.currentTarget.dataset.section;
    if (isSettingsSection(section)) {
      setActiveSection(section);
    }
  }, []);

  const handleOpenMigrationSettings = useCallback(() => {
    setActiveSection('migration');
  }, []);

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

  const saveSettings = useCallback(async () => {
    const current = settingsRef.current;
    if (!current) return null;
    clearAutoSaveTimer();
    return persistSettings(current);
  }, [clearAutoSaveTimer, persistSettings]);

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
      const next = await invoke<SidecarStatus>('start_sidecar', { settings: saved });
      setStatus(next);
      await refreshAutoTagStatus();
    }, t.appStarted);
  }, [refreshAutoTagStatus, runAction, saveSettings, t]);

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
    }, t.statusUpdated);
  }, [refreshAutoTagStatus, refreshStatus, runAction, t]);

  const handleOpenBrowser = useCallback(() => {
    void runAction(async () => {
      if (!status.running) {
        throw new Error(t.appNotRunning);
      }
      await openUrl(status.url);
    }, t.openedInBrowser);
  }, [runAction, status.running, status.url, t]);

  const handleOpenBrandLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      if (!status.running || busy) return;
      void openUrl(status.url);
    },
    [busy, status.running, status.url]
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

  const handleChooseDockerStorage = useCallback(() => {
    void runAction(async () => {
      const path = await choosePath(true);
      if (path) patchSettings({ dockerStorageRoot: path });
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
      patchSettings({ autoTagThreshold: Number(event.currentTarget.value) });
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
    return result;
  }, [settings]);

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
      const result = await invoke<MigrationResult>('migrate_from_docker', { settings: saved });
      return t.dockerMigrationCompleted(result.dbPath, result.exportDir);
    }, t.dockerMigrationCompletedSummary);
  }, [runAction, saveSettings, t]);

  const navItems = useMemo(
    () => [
      { id: 'general' as const, label: t.general, icon: SlidersHorizontal },
      { id: 'media' as const, label: t.media, icon: Film },
      { id: 'autotag' as const, label: t.autotag, icon: Sparkles },
      { id: 'migration' as const, label: t.migration, icon: Database },
    ],
    [t]
  );

  const serviceMeta = useMemo(() => {
    if (!status.running) return t.appNotRunning;
    return t.appActive;
  }, [status, t]);

  const autoTagTitle = useMemo(() => {
    if (autoTagStatus?.running) return t.autoTagRunningTitle;
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

  useEffect(() => {
    if (
      activeSection !== 'migration' ||
      !settings ||
      status.running ||
      busy ||
      dockerDetectionAttempted
    ) {
      return;
    }

    setDockerDetectionAttempted(true);
    void invoke<DockerSourceDetection>('detect_docker_source', { settings })
      .then((result) => {
        setDockerDetection(result);
      })
      .catch((error: unknown) => {
        setMessage(getErrorMessage(error));
      });
  }, [activeSection, busy, dockerDetectionAttempted, settings, status.running]);

  useEffect(() => {
    if (!autoTagInstallProgress?.running) return;

    const timer = window.setInterval(() => {
      void refreshAutoTagInstallProgress();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoTagInstallProgress?.running, refreshAutoTagInstallProgress]);

  if (!settings) {
    return (
      <main className="settings-shell loading-shell">
        <div className="loading-panel">{t.loadingSettings}</div>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <header className="top-bar">
        <div className="brand-block">
          <a
            className={status.running ? 'brand-link' : 'brand-link disabled'}
            href={status.running ? status.url : '#'}
            aria-label="Caramel Board"
            onClick={handleOpenBrandLink}
          >
            <CaramelBoardLogo className="brand-logo" />
          </a>
          <div className="brand-support" aria-label="Application information">
            <div className="brand-version">
              <span>v{APP_VERSION}</span>
              <span className="brand-hash">#{APP_GIT_HASH}</span>
            </div>
            <div className="brand-social-links">
              <a
                href={FANBOX_URL}
                aria-label="FANBOX"
                title="FANBOX"
                onClick={handleOpenExternalLink}
              >
                <Megaphone size={14} aria-hidden="true" />
              </a>
              <a href={X_URL} aria-label="X" title="X" onClick={handleOpenExternalLink}>
                <Twitter size={14} aria-hidden="true" />
              </a>
              <a
                href={GITHUB_URL}
                aria-label="GitHub"
                title="GitHub"
                onClick={handleOpenExternalLink}
              >
                <Github size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <div className="service-controls">
          <button
            type="button"
            className="refresh-button"
            onClick={handleRefreshStatus}
            disabled={busy}
            title={t.refreshStatus}
          >
            <RefreshCcw size={15} />
          </button>
          <button
            type="button"
            className="browser-button"
            onClick={handleOpenBrowser}
            disabled={busy || !status.running}
          >
            <ExternalLink size={15} />
            {t.openBrowser}
          </button>
          <button
            type="button"
            className={status.running ? 'fixed-service-button stop' : 'fixed-service-button start'}
            onClick={handleToggleSidecar}
            disabled={busy}
          >
            <HeaderActionIcon size={16} />
            {headerActionLabel}
          </button>
        </div>
      </header>

      <aside className="settings-sidebar">
        <div className="status-card">
          <span className={status.running ? 'status-pill running' : 'status-pill'}>
            <Circle size={10} fill="currentColor" />
            {statusLabel}
          </span>
          <span className="muted">{serviceMeta}</span>
          {autoTagStatus?.enabled || autoTagStatus?.running ? (
            <span className={autoTagStatus.running ? 'status-pill running' : 'status-pill'}>
              <Sparkles size={10} fill="currentColor" />
              {autoTagStatus.running ? t.autoTagRunningTitle : t.autotag}
            </span>
          ) : null}
          {status.running ? <span className="locked-note">{t.lockedWhileRunning}</span> : null}
        </div>

        <nav className="settings-nav" aria-label={t.settingsNavigation}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                data-section={item.id}
                className={activeSection === item.id ? 'nav-item active' : 'nav-item'}
                onClick={handleSelectSection}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="settings-content" aria-disabled={settingsDisabled}>
        {activeSection === 'general' ? (
          <div className="section-panel general-panel">
            <div className="section-heading">
              <SlidersHorizontal size={18} />
              <div>
                <h2>{t.general}</h2>
                <p>{t.generalDescription}</p>
              </div>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <Languages size={16} />
                <h3>{t.language}</h3>
              </div>
              <label className="field compact">
                <span>{t.displayLanguage}</span>
                <select
                  value={settings.language}
                  disabled={settingsDisabled}
                  onChange={handleLanguageChange}
                >
                  <option value="en">{t.english}</option>
                  <option value="ja">{t.japanese}</option>
                </select>
              </label>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <Database size={16} />
                <h3>{t.database}</h3>
              </div>
              <label className="field">
                <span>{t.sqliteDb}</span>
                <div className="path-row">
                  <input
                    value={settings.dbPath}
                    disabled={settingsDisabled}
                    data-setting="dbPath"
                    onChange={handleTextSettingChange}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseDb}
                    disabled={settingsDisabled}
                    title={t.chooseDatabase}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>
              <div className="button-row">
                <button type="button" onClick={handleMoveDb} disabled={settingsDisabled}>
                  <Folder size={15} />
                  {t.moveDatabase}
                </button>
                <button type="button" onClick={handleImportDb} disabled={settingsDisabled}>
                  <Upload size={15} />
                  {t.import}
                </button>
                <button type="button" onClick={handleExportDb} disabled={settingsDisabled}>
                  <Download size={15} />
                  {t.export}
                </button>
              </div>
              <button
                type="button"
                className="link-button"
                onClick={handleOpenMigrationSettings}
                disabled={busy}
              >
                <Database size={15} />
                {t.openMigrationSettings}
              </button>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <Folder size={16} />
                <h3>{t.files}</h3>
              </div>
              <label className="field">
                <span>{t.libraryPath}</span>
                <div className="path-row">
                  <input
                    value={settings.libraryPath}
                    disabled={settingsDisabled}
                    data-setting="libraryPath"
                    onChange={handleTextSettingChange}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseLibrary}
                    disabled={settingsDisabled}
                    title={t.chooseLibraryFolder}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>
              <div className="button-row single">
                <button type="button" onClick={handleMoveLibrary} disabled={settingsDisabled}>
                  <Folder size={15} />
                  {t.moveLibrary}
                </button>
              </div>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <Globe2 size={16} />
                <h3>{t.network}</h3>
              </div>
              <div className="inline-grid">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={settings.allowExternalNetwork}
                    disabled={settingsDisabled}
                    data-setting="allowExternalNetwork"
                    onChange={handleBooleanSettingChange}
                  />
                  <span>{t.allowExternalNetwork}</span>
                </label>
                <label className="field compact">
                  <span>{t.port}</span>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={settings.port}
                    disabled={settingsDisabled}
                    onChange={handlePortChange}
                  />
                </label>
              </div>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <KeyRound size={16} />
                <h3>{t.basicAuth}</h3>
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.basicAuthEnabled}
                  disabled={settingsDisabled}
                  data-setting="basicAuthEnabled"
                  onChange={handleBooleanSettingChange}
                />
                <span>{t.requireBasicAuth}</span>
              </label>
              <div className="auth-grid">
                <label className="field compact">
                  <span>{t.user}</span>
                  <input
                    value={settings.basicAuthUsername}
                    disabled={settingsDisabled}
                    data-setting="basicAuthUsername"
                    onChange={handleTextSettingChange}
                  />
                </label>
                <label className="field compact">
                  <span>{t.password}</span>
                  <input
                    type="password"
                    value={settings.basicAuthPassword}
                    disabled={settingsDisabled}
                    data-setting="basicAuthPassword"
                    onChange={handleTextSettingChange}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {activeSection === 'media' ? (
          <div className="section-panel">
            <div className="section-heading">
              <Film size={18} />
              <div>
                <h2>{t.media}</h2>
                <p>{t.mediaDescription}</p>
              </div>
            </div>

            <div className={ffmpegStatusClass}>
              <div className="migration-status-icon">
                {selectedFfmpegCandidate?.valid ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div className="migration-status-body">
                <h3>
                  {selectedFfmpegCandidate?.valid ? t.ffmpegReadyTitle : t.ffmpegMissingTitle}
                </h3>
                <p>
                  {selectedFfmpegCandidate?.valid
                    ? t.ffmpegReadyDescription
                    : t.ffmpegMissingDescription}
                </p>
                {selectedFfmpegCandidate?.path ? (
                  <span className="migration-storage">{selectedFfmpegCandidate.path}</span>
                ) : null}
              </div>
            </div>

            <div className="settings-group">
              <div className="group-heading">
                <Film size={16} />
                <h3>{t.ffmpeg}</h3>
              </div>
              <label className="field">
                <span>{t.ffmpegPath}</span>
                <div className="select-action-row">
                  <select
                    value={settings.ffmpegPath}
                    disabled={settingsDisabled}
                    onChange={handleFfmpegSelectChange}
                  >
                    <option value="">{t.ffmpegAutoDetect}</option>
                    {ffmpegCandidates.map((candidate) => (
                      <option key={candidate.path} value={candidate.path}>
                        {candidate.valid ? candidate.label : `${candidate.label} - invalid`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleRefreshFfmpeg}
                    disabled={settingsDisabled}
                    title={t.refreshFfmpeg}
                  >
                    <RefreshCcw size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseFfmpeg}
                    disabled={settingsDisabled}
                    title={t.chooseFfmpeg}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>

              <div className="candidate-list" aria-label={t.ffmpegCandidates}>
                <div className="candidate-list-heading">{t.ffmpegCandidates}</div>
                {ffmpegCandidates.length === 0 ? (
                  <span className="muted">{t.ffmpegNoCandidates}</span>
                ) : (
                  ffmpegCandidates.map((candidate) => (
                    <div
                      key={candidate.path}
                      className={
                        candidate.path === selectedFfmpegCandidate?.path
                          ? 'candidate-item active'
                          : 'candidate-item'
                      }
                    >
                      <span
                        className={
                          candidate.valid ? 'candidate-state ready' : 'candidate-state missing'
                        }
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
        ) : null}

        {activeSection === 'autotag' ? (
          <div className="section-panel">
            <div className="section-heading">
              <Sparkles size={18} />
              <div>
                <h2>{t.autotag}</h2>
                <p>{t.autotagDescription}</p>
              </div>
            </div>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.autoTagEnabled}
                disabled={settingsDisabled || !autoTagStatus?.ready}
                data-setting="autoTagEnabled"
                onChange={handleBooleanSettingChange}
              />
              <span>{t.autoTagEnable}</span>
            </label>

            <div className={autoTagStatusClass}>
              <div className="migration-status-icon">
                {autoTagStatus?.ready || autoTagStatus?.running ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div className="migration-status-body">
                <h3>{autoTagTitle}</h3>
                <p>{autoTagDescription}</p>
                {autoTagStatus?.url ? (
                  <span className="migration-storage">{autoTagStatus.url}</span>
                ) : null}
              </div>
            </div>

            {autoTagInstallProgress?.running || autoTagInstallProgress?.completed ? (
              <div
                className={
                  autoTagInstallProgress.error
                    ? 'install-progress-card error'
                    : autoTagInstallProgress.completed
                      ? 'install-progress-card complete'
                      : 'install-progress-card'
                }
              >
                <div className="install-progress-heading">
                  <Sparkles size={16} />
                  <strong>
                    {autoTagInstallProgress.completed
                      ? t.autoTagInstallCompleted
                      : t.autoTagInstallInProgress}
                  </strong>
                </div>
                <p>{autoTagInstallProgress.message}</p>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round(autoTagInstallProgress.percent)}%` }}
                  />
                </div>
                <span className="muted">{Math.round(autoTagInstallProgress.percent)}%</span>
              </div>
            ) : null}

            <div className="button-row migration-actions">
              <button type="button" onClick={handleRefreshAutoTagStatus} disabled={busy}>
                <RefreshCcw size={15} />
                {t.autoTagCheck}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleOpenAutoTagInstallDialog}
                disabled={
                  settingsDisabled || autoTagInstallProgress?.running || autoTagStatus?.ready
                }
              >
                <Download size={15} />
                {t.autoTagPrepare}
              </button>
            </div>

            <details className="advanced-settings">
              <summary>{t.advancedSettings}</summary>
              <p>{t.autoTagAdvancedDescription}</p>
              <label className="field">
                <span>{t.autoTagCodeFolder}</span>
                <div className="path-row">
                  <input
                    value={settings.autoTagRepoDir}
                    disabled={settingsDisabled}
                    data-setting="autoTagRepoDir"
                    onChange={handleTextSettingChange}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseAutoTagCode}
                    disabled={settingsDisabled}
                    title={t.chooseAutoTagCodeFolder}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>
              <label className="field">
                <span>{t.autoTagModelFolder}</span>
                <div className="path-row">
                  <input
                    value={settings.autoTagModelDir}
                    disabled={settingsDisabled}
                    data-setting="autoTagModelDir"
                    onChange={handleTextSettingChange}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseAutoTagModel}
                    disabled={settingsDisabled}
                    title={t.chooseAutoTagModelFolder}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>
              <div className="auth-grid">
                <label className="field compact">
                  <span>{t.autoTagPort}</span>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={settings.autoTagPort}
                    disabled={settingsDisabled}
                    onChange={handleAutoTagPortChange}
                  />
                </label>
                <label className="field compact">
                  <span>{t.autoTagThreshold}</span>
                  <input
                    type="number"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={settings.autoTagThreshold}
                    disabled={settingsDisabled}
                    onChange={handleAutoTagThresholdChange}
                  />
                </label>
              </div>
            </details>
          </div>
        ) : null}

        {activeSection === 'migration' ? (
          <div className="section-panel">
            <div className="section-heading">
              <Database size={18} />
              <div>
                <h2>{t.dockerMigration}</h2>
                <p>{t.dockerMigrationDescription}</p>
              </div>
            </div>

            <div
              className={
                dockerDetection?.available
                  ? 'migration-status ready'
                  : dockerDetectionAttempted
                    ? 'migration-status missing'
                    : 'migration-status waiting'
              }
            >
              <div className="migration-status-icon">
                {dockerDetection?.available ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div className="migration-status-body">
                <h3>
                  {dockerDetection?.available
                    ? t.migrationReadyTitle
                    : dockerDetectionAttempted
                      ? t.migrationNotFoundTitle
                      : t.migrationWaitingTitle}
                </h3>
                <p>
                  {dockerDetection?.available
                    ? t.migrationReadyDescription(
                        dockerDetection.datasetCount,
                        dockerDetection.stackCount,
                        dockerDetection.assetCount
                      )
                    : dockerDetectionAttempted
                      ? t.migrationNotFoundDescription
                      : t.migrationWaitingDescription}
                </p>
                {dockerDetection?.available && dockerDetection.storageRoot ? (
                  <span className="migration-storage">
                    {t.storageLocation}: {dockerDetection.storageRoot}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="button-row migration-actions">
              <button type="button" onClick={handleDetectDockerSource} disabled={settingsDisabled}>
                <RefreshCcw size={15} />
                {t.detectOldDocker}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleMigrateFromDocker}
                disabled={settingsDisabled}
              >
                <Database size={15} />
                {t.migrateFromDocker}
              </button>
            </div>

            <details className="advanced-settings">
              <summary>{t.advancedSettings}</summary>
              <p>{t.advancedSettingsDescription}</p>
              <label className="field">
                <span>{t.postgresDatabaseUrl}</span>
                <input
                  value={settings.dockerDatabaseUrl}
                  disabled={settingsDisabled}
                  data-setting="dockerDatabaseUrl"
                  onChange={handleTextSettingChange}
                />
              </label>
              <label className="field">
                <span>{t.dockerStorageRoot}</span>
                <div className="path-row">
                  <input
                    value={settings.dockerStorageRoot}
                    disabled={settingsDisabled}
                    data-setting="dockerStorageRoot"
                    onChange={handleTextSettingChange}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleChooseDockerStorage}
                    disabled={settingsDisabled}
                    title={t.chooseDockerStorageRoot}
                  >
                    <Folder size={15} />
                  </button>
                </div>
              </label>
              <div className="auth-grid">
                <label className="field compact">
                  <span>{t.datasetId}</span>
                  <input
                    value={settings.dockerDatasetId}
                    placeholder={t.optional}
                    disabled={settingsDisabled}
                    data-setting="dockerDatasetId"
                    onChange={handleTextSettingChange}
                  />
                </label>
                <label className="toggle-row bottom-aligned">
                  <input
                    type="checkbox"
                    checked={settings.dockerVerifyFiles}
                    disabled={settingsDisabled}
                    data-setting="dockerVerifyFiles"
                    onChange={handleBooleanSettingChange}
                  />
                  <span>{t.verifyFileReferences}</span>
                </label>
              </div>
            </details>
          </div>
        ) : null}

        <footer className="settings-footer">
          <span className="auto-save-note">{t.settingsAutoSaved}</span>
          {message ? <div className="message-box">{message}</div> : null}
        </footer>
      </section>

      {autoTagInstallStep ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true">
            {autoTagInstallStep === 'intro' ? (
              <>
                <div className="modal-heading">
                  <Sparkles size={20} />
                  <h2>{t.autoTagInstallIntroTitle}</h2>
                </div>
                <div className="modal-copy">
                  <p>{t.autoTagInstallIntroLead}</p>
                  <p>{t.autoTagInstallIntroDetail}</p>
                  <p>{t.autoTagInstallIntroLocal}</p>
                  <p>{t.autoTagInstallIntroTraining}</p>
                  <a href="https://github.com/fpgaminer/joytag" onClick={handleOpenExternalLink}>
                    <ExternalLink size={14} />
                    {t.autoTagInstallReference}
                  </a>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={handleCancelAutoTagInstallDialog}>
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleContinueAutoTagInstallIntro}
                    disabled={busy}
                  >
                    {t.continue}
                  </button>
                </div>
              </>
            ) : null}

            {autoTagInstallStep === 'metadata' ? (
              <>
                <div className="modal-heading">
                  <RefreshCcw size={20} />
                  <h2>{t.autoTagMetadataLoading}</h2>
                </div>
                <div className="modal-copy">
                  <p>{t.autoTagInstallIntroDetail}</p>
                </div>
              </>
            ) : null}

            {autoTagInstallStep === 'confirm' && autoTagInstallMetadata ? (
              <>
                <div className="modal-heading">
                  <Download size={20} />
                  <h2>{t.autoTagDownloadConfirmTitle}</h2>
                </div>
                <div className="modal-copy">
                  <p>{t.autoTagDownloadConfirm(autoTagInstallMetadata.downloadSize)}</p>
                  <a href={autoTagInstallMetadata.modelUrl} onClick={handleOpenExternalLink}>
                    <ExternalLink size={14} />
                    {autoTagInstallMetadata.modelName}
                  </a>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={handleCancelAutoTagInstallDialog}>
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleStartAutoTagInstall}
                    disabled={busy}
                  >
                    {t.continue}
                  </button>
                </div>
              </>
            ) : null}

            {autoTagInstallStep === 'progress' && autoTagInstallProgress ? (
              <>
                <div className="modal-heading">
                  <Sparkles size={20} />
                  <h2>{t.autoTagInstallInProgress}</h2>
                </div>
                <div className="modal-copy">
                  <p>{autoTagInstallProgress.message}</p>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.round(autoTagInstallProgress.percent)}%` }}
                    />
                  </div>
                  <span className="muted">{Math.round(autoTagInstallProgress.percent)}%</span>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={handleDismissAutoTagProgress}>
                    {autoTagInstallProgress.running ? t.autoTagBackgroundContinue : t.close}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
