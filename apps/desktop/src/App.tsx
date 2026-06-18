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
  FileText,
  Film,
  Folder,
  Github,
  Globe2,
  Languages,
  Megaphone,
  Monitor,
  PanelTop,
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
import { SetupWizard } from './SetupWizard';

interface AppSettings {
  dbPath: string;
  libraryPath: string;
  setupCompleted: boolean;
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
  pdfRasterizerPath: string;
  launchOnStartup: boolean;
  residentMode: ResidentMode;
}

interface SidecarStatus {
  running: boolean;
  url: string;
  pid: number | null;
  startedAt: number | null;
}

interface DockerMigrationProgress {
  running: boolean;
  completed: boolean;
  phase: string;
  message: string;
  percent: number;
  lastLog: string;
  exportDir: string | null;
  dbPath: string | null;
  error: string | null;
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
  starting: boolean;
  reachable: boolean;
  url: string;
  logPath: string;
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

interface PdfRasterizerCandidate {
  path: string;
  label: string;
  source: string;
  valid: boolean;
  version: string;
  details: string;
}

type AppLanguage = 'en' | 'ja';
type ResidentMode = 'taskbar' | 'tray';
type AutoTagInstallStep = 'intro' | 'metadata' | 'confirm' | 'progress' | null;
type TextSettingKey =
  | 'dbPath'
  | 'libraryPath'
  | 'basicAuthUsername'
  | 'basicAuthPassword'
  | 'autoTagRepoDir'
  | 'autoTagModelDir'
  | 'ffmpegPath'
  | 'pdfRasterizerPath'
  | 'dockerDatabaseUrl'
  | 'dockerStorageRoot'
  | 'dockerDatasetId';
type BooleanSettingKey =
  | 'allowExternalNetwork'
  | 'basicAuthEnabled'
  | 'dockerVerifyFiles'
  | 'autoTagEnabled'
  | 'launchOnStartup';

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

const isAppLanguage = (value: string | undefined): value is AppLanguage =>
  value === 'en' || value === 'ja';

const isResidentMode = (value: string | undefined): value is ResidentMode =>
  value === 'taskbar' || value === 'tray';

const isTextSettingKey = (value: string | undefined): value is TextSettingKey =>
  value === 'dbPath' ||
  value === 'libraryPath' ||
  value === 'basicAuthUsername' ||
  value === 'basicAuthPassword' ||
  value === 'autoTagRepoDir' ||
  value === 'autoTagModelDir' ||
  value === 'ffmpegPath' ||
  value === 'pdfRasterizerPath' ||
  value === 'dockerDatabaseUrl' ||
  value === 'dockerStorageRoot' ||
  value === 'dockerDatasetId';

const isBooleanSettingKey = (value: string | undefined): value is BooleanSettingKey =>
  value === 'allowExternalNetwork' ||
  value === 'basicAuthEnabled' ||
  value === 'dockerVerifyFiles' ||
  value === 'autoTagEnabled' ||
  value === 'launchOnStartup';

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
    media: 'Media',
    autotag: 'AutoTag',
    migration: 'Migration',
    settingsNavigation: 'Settings navigation',
    generalDescription:
      'Core standalone settings for database, files, network, and access control.',
    startupAndResident: 'Startup and resident mode',
    startupAndResidentDescription:
      'Choose whether Caramel Board starts at login and where the settings window stays available.',
    launchOnStartup: 'Start Caramel Board when you sign in',
    residentMode: 'Resident mode',
    taskbarMode: 'Taskbar',
    dockMode: 'Dock',
    trayMode: 'Task tray',
    menuBarMode: 'Menu bar',
    taskbarModeHint: 'Closing the settings window minimizes it so it can be reopened from there.',
    trayModeHint: 'Closing the settings window hides it; reopen it from the resident icon.',
    mediaDescription: 'Configure FFmpeg for GIF and video preview generation.',
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
    pdf: 'PDF import',
    poppler: 'Poppler',
    popplerDescription:
      'Configure Poppler used to rasterize PDF pages before importing them as page images.',
    pdfRasterizerPath: 'pdftocairo executable',
    pdfRasterizerAutoDetect: 'Auto detect from PATH',
    choosePdfRasterizer: 'Choose pdftocairo',
    refreshPdfRasterizer: 'Detect Poppler',
    pdfReadyTitle: 'Poppler is ready',
    pdfMissingTitle: 'Poppler is not configured',
    pdfReadyDescription: 'PDF pages can be imported as 350dpi images with this executable.',
    pdfMissingDescription:
      'Install Poppler separately, then select pdftocairo from the detected list or browse to it.',
    pdfCandidates: 'Detected Poppler',
    pdfNoCandidates: 'No pdftocairo executable was found on PATH.',
    pdfSelected: 'Poppler path selected.',
    pdfChecked: 'Poppler detection completed.',
    autotagDescription:
      'Use AutoTag to automatically tag imported images and enable image-based discovery such as similar-image search. Everything runs locally with the open-source JoyTag model; your images are never sent anywhere or used to train AI.',
    autoTagEnable: 'Use AutoTag',
    autoTagReadyTitle: 'AutoTag is ready',
    autoTagRunningTitle: 'AutoTag is running',
    autoTagStartingTitle: 'AutoTag is starting',
    autoTagMissingTitle: 'AutoTag is not installed',
    autoTagOffTitle: 'AutoTag is off',
    autoTagOffDescription: 'Turn it on to start AutoTag together with Caramel Board.',
    autoTagReadyDescription: 'AutoTag can start together with Caramel Board.',
    autoTagSetupDescription:
      'Install the model to enable automatic tags for imported images and similar-image search.',
    autoTagPrepare: 'Install model',
    autoTagCheck: 'Check AutoTag',
    autoTagPrepared: 'AutoTag was installed and enabled.',
    autoTagChecked: 'AutoTag status updated.',
    autoTagInstallIntroTitle: 'Install AutoTag model',
    autoTagInstallIntroLead: 'AutoTag uses the open-source JoyTag model.',
    autoTagInstallIntroDetail:
      'This feature uses a pre-trained model to generate tags from images. CUDA is not required for normal CPU tagging. If you want GPU acceleration and CUDA setup fails, install the latest NVIDIA driver and CUDA Toolkit, then try again.',
    autoTagInstallIntroLocal:
      'All processing runs locally. Images are not transferred outside this computer.',
    autoTagInstallIntroTraining: 'Images used with this feature are not used for training.',
    autoTagInstallReference: 'Reference',
    autoTagMetadataLoading: 'Fetching model metadata...',
    autoTagDownloadConfirmTitle: 'Download model data',
    autoTagDownloadConfirm: (size: string) =>
      `${size} of data will be downloaded. Continue? CUDA is not required for CPU tagging. If you want GPU acceleration and CUDA setup fails, install the latest NVIDIA driver and CUDA Toolkit, then try again.`,
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
    autoTagThreshold: 'How easily tags appear',
    autoTagThresholdLess: 'Stricter',
    autoTagThresholdMore: 'Looser',
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
    files: 'Files',
    libraryPath: 'Library path',
    chooseLibraryFolder: 'Choose library folder',
    moveLibrary: 'Move library',
    dataStore: 'Data store',
    dataStoreLocation: 'Data store location',
    moveDataStore: 'Move data store',
    dataStoreMoved: 'Data store moved.',
    dataStoreHint:
      'The data store is the default home for the SQLite database and library folder. The library path below is the actual file storage location; Docker migration reuses the selected existing asset folder there. Moving the data store moves the current database and current library together.',
    advancedDataStore: 'Advanced (individual paths)',
    advancedDataStoreDescription:
      'Change the database file or library folder path individually. Use this when the database and media files live on different drives or when reusing an existing library folder.',
    resetSetup: 'Run setup again',
    resetSetupConfirmTitle: 'Run setup again?',
    resetSetupConfirmBody:
      'The setup wizard will open the next time you start. Your data stays where it is.',
    resetSetupDone: 'Setup has been reset.',
    network: 'Sharing',
    networkDescription:
      'Open Caramel Board from other devices on the same network (phone, tablet, another PC). In typical home networks only devices on your local network can reach it, but depending on your router or environment it may also become reachable from the Internet. Exposing Caramel Board directly to the Internet is strongly discouraged — for remote access, use a VPN like Tailscale. When sharing, we recommend enabling the name and password protection.',
    allowExternalNetwork: 'Allow access from other devices on this network',
    port: 'Port',
    advancedSharing: 'Advanced (port)',
    advancedSharingDescription: 'The port other devices connect on. Usually no need to change.',
    basicAuth: 'Login',
    requireBasicAuth: 'Protect the page with a password',
    requireBasicAuthHint:
      'Visitors will need a name and password to open the page. Recommended when other people share the network.',
    user: 'Name',
    password: 'Password',
    dockerMigration: 'Docker Migration',
    dockerMigrationDescription:
      'Start the old Docker version, confirm the asset folder, then migrate.',
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
      'Usually not needed. Use this only when the old Docker setup uses a custom database URL.',
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
    dockerMigrationInProgress: 'Migration in progress',
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
    media: 'メディア処理',
    autotag: '自動タグ',
    migration: '移行',
    settingsNavigation: '設定ナビゲーション',
    generalDescription: 'DB、ファイル、ネットワーク、アクセス設定をまとめて管理します。',
    startupAndResident: '自動起動と常駐',
    startupAndResidentDescription:
      'ログイン時に起動するか、設定画面をどこから開けるようにするかを選びます。',
    launchOnStartup: 'ログイン時に Caramel Board を起動する',
    residentMode: '常駐方法',
    taskbarMode: 'タスクバー',
    dockMode: 'Dock',
    trayMode: 'タスクトレイ',
    menuBarMode: 'メニューバー',
    taskbarModeHint: '設定画面を閉じると最小化し、ここから再表示できます。',
    trayModeHint: '設定画面を閉じると隠れ、常駐アイコンから再表示できます。',
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
    pdf: 'PDF 取り込み',
    poppler: 'Poppler',
    popplerDescription: 'PDF ページを画像として取り込むために使用する Poppler を設定します。',
    pdfRasterizerPath: 'pdftocairo 実行ファイル',
    pdfRasterizerAutoDetect: 'PATH から自動検出',
    choosePdfRasterizer: 'pdftocairo を選択',
    refreshPdfRasterizer: 'Poppler を検出',
    pdfReadyTitle: 'Poppler を利用できます',
    pdfMissingTitle: 'Poppler が設定されていません',
    pdfReadyDescription: 'この実行ファイルで PDF ページを 350dpi の画像として取り込めます。',
    pdfMissingDescription:
      'Poppler を別途インストールし、検出候補から選ぶか pdftocairo を参照してください。',
    pdfCandidates: '検出された Poppler',
    pdfNoCandidates: 'PATH 上に pdftocairo は見つかりませんでした。',
    pdfSelected: 'Poppler のパスを選択しました。',
    pdfChecked: 'Poppler の検出が完了しました。',
    autotagDescription:
      '自動タグを使うと、取り込んだ画像に自動でタグを付け、類似画像検索など画像ベースの検索に活用できます。オープンソースの JoyTag モデルでローカル処理し、画像が外部に送信されたり、AI の学習に使われたりすることはありません。',
    autoTagEnable: '自動タグを使う',
    autoTagReadyTitle: '自動タグを利用できます',
    autoTagRunningTitle: '自動タグが起動しています',
    autoTagStartingTitle: '自動タグを起動中です',
    autoTagMissingTitle: '自動タグはインストールされていません',
    autoTagOffTitle: '自動タグはOFFです',
    autoTagOffDescription: 'ONにすると Caramel Board の起動時に自動タグも一緒に起動します。',
    autoTagReadyDescription: 'Caramel Board と一緒に起動できます。',
    autoTagSetupDescription:
      'モデルをインストールすると、取り込んだ画像の自動タグ付けと類似画像検索を利用できます。',
    autoTagPrepare: 'モデルをインストール',
    autoTagCheck: '状態を確認',
    autoTagPrepared: '自動タグをインストールし、有効にしました。',
    autoTagChecked: '自動タグの状態を更新しました。',
    autoTagInstallIntroTitle: '自動タグモデルのインストール',
    autoTagInstallIntroLead: '自動タグにはオープンソースのJoyTagを使用します。',
    autoTagInstallIntroDetail:
      'この機能により、事前に学習されたモデルを使用し、画像のタグを生成します。通常の CPU タグ付けに CUDA は不要です。GPU 高速化を使いたい場合に CUDA のセットアップで失敗したら、最新の NVIDIA ドライバーと CUDA Toolkit をインストールしてから再試行してください。',
    autoTagInstallIntroLocal:
      '動作は全てローカルで完結し、画像が外部に転送されることはありません。',
    autoTagInstallIntroTraining: 'この機能で使用された画像が学習されることはありません。',
    autoTagInstallReference: '詳細',
    autoTagMetadataLoading: 'メタデータを取得中...',
    autoTagDownloadConfirmTitle: 'モデルのダウンロード',
    autoTagDownloadConfirm: (size: string) =>
      `${size} のデータをダウンロードします。続けますか？ CPU でのタグ付けに CUDA は不要です。GPU 高速化を使いたい場合に CUDA のセットアップで失敗したら、最新の NVIDIA ドライバーと CUDA Toolkit をインストールしてから再試行してください。`,
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
    autoTagThreshold: 'タグの出やすさ',
    autoTagThresholdLess: '厳選',
    autoTagThresholdMore: '多め',
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
    files: 'ファイル',
    libraryPath: 'ライブラリパス',
    chooseLibraryFolder: 'ライブラリフォルダを選択',
    moveLibrary: 'ライブラリを移動',
    dataStore: 'データストア',
    dataStoreLocation: 'データストアの場所',
    moveDataStore: 'データストアを移動',
    dataStoreMoved: 'データストアを移動しました。',
    dataStoreHint:
      'データストアは SQLite データベースと標準のライブラリフォルダの置き場所です。実際の画像・動画ファイルの読み書き先は下のライブラリパスで決まります。Docker 版から移行した場合は、選択した既存のアセットフォルダをライブラリパスとして再利用します。データストアを移動すると、現在のデータベースと現在のライブラリをまとめて移動します。',
    advancedDataStore: '詳細(個別パス指定)',
    advancedDataStoreDescription:
      'データベースファイルとライブラリフォルダの場所を別々に指定できます。DB とメディアファイルを別ドライブに置く場合や、既存のライブラリフォルダを再利用する場合に使います。',
    resetSetup: 'セットアップをやり直す',
    resetSetupConfirmTitle: 'セットアップをやり直しますか?',
    resetSetupConfirmBody:
      '次回起動時にセットアップウィザードが表示されます。データはそのまま残ります。',
    resetSetupDone: 'セットアップ情報をリセットしました。',
    network: '共有',
    networkDescription:
      '同じネットワーク上の機器(スマートフォン・タブレット・別の PC)から Caramel Board を開けるようになります。通常はローカルネットワーク内からのみアクセスできますが、ルーターや環境によってはインターネットからアクセスできる場合があります。インターネットへの直接公開は強く非推奨です。外出先からアクセスしたい場合は Tailscale などの VPN 経由を推奨します。共有を有効にする場合は名前とパスワードによる保護もおすすめします。',
    allowExternalNetwork: '他の機器からのアクセスを許可する',
    port: 'ポート',
    advancedSharing: '詳細(ポート)',
    advancedSharingDescription: '他の機器が接続するときに使うポート番号です。通常は変更不要です。',
    basicAuth: 'ログイン',
    requireBasicAuth: 'ページをパスワードで保護する',
    requireBasicAuthHint:
      'ページにアクセスするために、名前とパスワードが必要になります。他の人が参加しているネットワークの場合、設定を推奨します。',
    user: '名前',
    password: 'パスワード',
    dockerMigration: 'Docker版からの移行',
    dockerMigrationDescription:
      '旧Docker版を起動した状態で、アセットフォルダを確認してから移行してください。',
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
      '通常は変更不要です。旧Docker版で接続先 URL を変更している場合だけ使います。',
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
    dockerMigrationInProgress: '移行中',
    settingsAutoSaved: '設定は自動保存されます。',
    sqliteFilterName: 'SQLiteデータベース',
  },
};

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
  const [ffmpegCandidates, setFfmpegCandidates] = useState<FfmpegCandidate[]>([]);
  const [pdfRasterizerCandidates, setPdfRasterizerCandidates] = useState<PdfRasterizerCandidate[]>(
    []
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [localIp, setLocalIp] = useState<string>('');
  const settingsRef = useRef<AppSettings | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  const language = settings?.language ?? getInitialLanguage();
  const t = translations[language];
  const settingsDisabled = busy || status.running;
  const shellSettingsDisabled = busy;
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
      const installProgress = await invoke<AutoTagInstallProgress>('autotag_install_progress');
      setAutoTagInstallProgress(installProgress);
      const migrationProgress = await invoke<DockerMigrationProgress>('docker_migration_progress');
      setDockerMigrationProgress(migrationProgress);
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
      await invoke<boolean>('wait_server_ready', { port: saved.port, timeoutMs: 60000 });
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
        }}
      />
    );
  }

  return (
    <main className="settings-shell">
      <header className="top-bar">
        <div className="brand-block">
          <a
            className={status.running ? 'brand-link' : 'brand-link disabled'}
            href={status.running ? displayUrl : '#'}
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
        <nav className="settings-nav" aria-label={t.settingsNavigation}>
          {navJumpItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className="nav-item"
                onClick={() => scrollToSection(item.id)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

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

        <div id="section-data-store" className="section-panel general-panel">
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
              <Monitor size={16} />
              <h3>{t.startupAndResident}</h3>
            </div>
            <p className="muted">{t.startupAndResidentDescription}</p>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.launchOnStartup}
                disabled={shellSettingsDisabled}
                data-setting="launchOnStartup"
                onChange={handleBooleanSettingChange}
              />
              <span>{t.launchOnStartup}</span>
            </label>
            <label className="field compact">
              <span>{t.residentMode}</span>
              <select
                value={settings.residentMode}
                disabled={shellSettingsDisabled}
                onChange={handleResidentModeChange}
              >
                <option value="tray">{residentModeLabels.tray}</option>
                <option value="taskbar">{residentModeLabels.taskbar}</option>
              </select>
            </label>
            <div className="resident-mode-hint">
              <PanelTop size={15} />
              <span>{settings.residentMode === 'tray' ? t.trayModeHint : t.taskbarModeHint}</span>
            </div>
          </div>

          <div className="settings-group">
            <div className="group-heading">
              <Database size={16} />
              <h3>{t.dataStore}</h3>
            </div>
            <p className="muted">{t.dataStoreHint}</p>
            <label className="field">
              <span>{t.dataStoreLocation}</span>
              <input value={dataStoreRoot} disabled readOnly />
            </label>
            <div className="button-row">
              <button type="button" onClick={handleMoveDataStore} disabled={settingsDisabled}>
                <Folder size={15} />
                {t.moveDataStore}
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
            <details className="advanced-settings">
              <summary>{t.advancedDataStore}</summary>
              <p>{t.advancedDataStoreDescription}</p>
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
              <div className="button-row single">
                <button type="button" onClick={handleMoveDb} disabled={settingsDisabled}>
                  <Folder size={15} />
                  {t.moveDatabase}
                </button>
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
            </details>
            <button
              type="button"
              className="link-button"
              onClick={handleOpenResetSetup}
              disabled={settingsDisabled}
            >
              <RefreshCcw size={15} />
              {t.resetSetup}
            </button>
          </div>

          <div className="settings-group">
            <div className="group-heading">
              <Globe2 size={16} />
              <h3>{t.network}</h3>
            </div>
            <p className="muted">{t.networkDescription}</p>
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

            {settings.allowExternalNetwork ? (
              <>
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
                <p className="muted">{t.requireBasicAuthHint}</p>
                {settings.basicAuthEnabled ? (
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
                ) : null}
              </>
            ) : null}

            <details className="advanced-settings">
              <summary>{t.advancedSharing}</summary>
              <p>{t.advancedSharingDescription}</p>
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
            </details>
          </div>
        </div>

        <div id="section-media" className="section-panel">
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
              <h3>{selectedFfmpegCandidate?.valid ? t.ffmpegReadyTitle : t.ffmpegMissingTitle}</h3>
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

        <div id="section-poppler" className="section-panel">
          <div className="section-heading">
            <FileText size={18} />
            <div>
              <h2>{t.poppler}</h2>
              <p>{t.popplerDescription}</p>
            </div>
          </div>

          <div className={pdfRasterizerStatusClass}>
            <div className="migration-status-icon">
              {selectedPdfRasterizerCandidate?.valid ? (
                <CheckCircle2 size={20} />
              ) : (
                <AlertCircle size={20} />
              )}
            </div>
            <div className="migration-status-body">
              <h3>{selectedPdfRasterizerCandidate?.valid ? t.pdfReadyTitle : t.pdfMissingTitle}</h3>
              <p>
                {selectedPdfRasterizerCandidate?.valid
                  ? t.pdfReadyDescription
                  : t.pdfMissingDescription}
              </p>
              {selectedPdfRasterizerCandidate?.path ? (
                <span className="migration-storage">{selectedPdfRasterizerCandidate.path}</span>
              ) : null}
            </div>
          </div>

          <div className="settings-group">
            <div className="group-heading">
              <FileText size={16} />
              <h3>{t.pdf}</h3>
            </div>
            <label className="field">
              <span>{t.pdfRasterizerPath}</span>
              <div className="select-action-row">
                <select
                  value={settings.pdfRasterizerPath}
                  disabled={settingsDisabled}
                  onChange={handlePdfRasterizerSelectChange}
                >
                  <option value="">{t.pdfRasterizerAutoDetect}</option>
                  {pdfRasterizerCandidates.map((candidate) => (
                    <option key={candidate.path} value={candidate.path}>
                      {candidate.valid ? candidate.label : `${candidate.label} - invalid`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleRefreshPdfRasterizer}
                  disabled={settingsDisabled}
                  title={t.refreshPdfRasterizer}
                >
                  <RefreshCcw size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleChoosePdfRasterizer}
                  disabled={settingsDisabled}
                  title={t.choosePdfRasterizer}
                >
                  <Folder size={15} />
                </button>
              </div>
            </label>

            <div className="candidate-list" aria-label={t.pdfCandidates}>
              <div className="candidate-list-heading">{t.pdfCandidates}</div>
              {pdfRasterizerCandidates.length === 0 ? (
                <span className="muted">{t.pdfNoCandidates}</span>
              ) : (
                pdfRasterizerCandidates.map((candidate) => (
                  <div
                    key={candidate.path}
                    className={
                      candidate.path === selectedPdfRasterizerCandidate?.path
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

        <div id="section-autotag" className="section-panel">
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

          <label className="field">
            <span>{t.autoTagThreshold}</span>
            <div className="threshold-row">
              <span className="muted">{t.autoTagThresholdLess}</span>
              <input
                type="range"
                min={10}
                max={95}
                step={5}
                value={Math.round((1 - settings.autoTagThreshold) * 100)}
                disabled={settingsDisabled}
                onChange={(event) =>
                  patchSettings({
                    autoTagThreshold: 1 - Number(event.currentTarget.value) / 100,
                  })
                }
              />
              <span className="muted">{t.autoTagThresholdMore}</span>
            </div>
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
              {autoTagStatus?.logPath ? (
                <span className="migration-storage">{autoTagStatus.logPath}</span>
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
              disabled={settingsDisabled || autoTagInstallProgress?.running || autoTagStatus?.ready}
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
            </div>
          </details>
        </div>

        <div id="section-migration" className="section-panel">
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
              {dockerDetection?.available ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
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

          <div className="button-row migration-actions">
            <button type="button" onClick={handleDetectDockerSource} disabled={settingsDisabled}>
              <RefreshCcw size={15} />
              {t.detectOldDocker}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleMigrateFromDocker}
              disabled={
                settingsDisabled ||
                !settings.dockerStorageRoot.trim() ||
                dockerMigrationProgress?.running
              }
            >
              <Database size={15} />
              {t.migrateFromDocker}
            </button>
          </div>

          {dockerMigrationProgress?.running ||
          dockerMigrationProgress?.completed ||
          dockerMigrationProgress?.error ? (
            <div
              className={
                dockerMigrationProgress.error
                  ? 'install-progress-card error'
                  : dockerMigrationProgress.completed
                    ? 'install-progress-card complete'
                    : 'install-progress-card'
              }
            >
              <div className="install-progress-heading">
                <Database size={16} />
                <strong>{t.dockerMigrationInProgress}</strong>
              </div>
              <p>{dockerMigrationProgress.message}</p>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(dockerMigrationProgress.percent)}%` }}
                />
              </div>
              <span className="muted">{Math.round(dockerMigrationProgress.percent)}%</span>
              {dockerMigrationProgress.lastLog ? (
                <p className="muted">{dockerMigrationProgress.lastLog}</p>
              ) : null}
            </div>
          ) : null}

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

        <footer className="settings-footer">
          <span className="auto-save-note">{t.settingsAutoSaved}</span>
          {message ? <div className="message-box">{message}</div> : null}
        </footer>
      </section>

      {resetSetupOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <RefreshCcw size={20} />
              <h2>{t.resetSetupConfirmTitle}</h2>
            </div>
            <div className="modal-copy">
              <p>{t.resetSetupConfirmBody}</p>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={handleCancelResetSetup}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleConfirmResetSetup}
                disabled={busy}
              >
                <RefreshCcw size={15} />
                {t.resetSetup}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
