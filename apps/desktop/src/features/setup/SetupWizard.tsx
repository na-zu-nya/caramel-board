import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileText,
  Film,
  Folder,
  FolderOpen,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaramelBoardLogo } from '../../shared/brand/CaramelBoardLogo';

export type WizardLanguage = 'en' | 'ja';

interface AppSettingsLike {
  dbPath: string;
  libraryPath: string;
  setupCompleted: boolean;
  language: string;
  dockerDatabaseUrl: string;
  dockerStorageRoot: string;
  allowExternalNetwork: boolean;
  basicAuthEnabled: boolean;
  basicAuthUsername: string;
  basicAuthPassword: string;
  port: number;
}

interface SidecarStatus {
  running: boolean;
  url: string;
  pid: number | null;
  startedAt: number | null;
}

interface DataStoreInspection {
  path: string;
  exists: boolean;
  hasDatabase: boolean;
  hasLibrary: boolean;
  isEmpty: boolean;
}

interface DockerSourceDetection {
  available: boolean;
  databaseUrl: string;
  storageRoot: string;
  storageRootExists: boolean;
  datasetCount: number;
  stackCount: number;
  assetCount: number;
  message: string;
}

interface DockerStorageResolution {
  resolved: string;
  adjusted: boolean;
  matched: boolean;
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

type AutoTagInstallPhase = 'idle' | 'metadata' | 'confirm' | 'progress' | 'done' | 'failed';

type FullSettings = AppSettingsLike & {
  ffmpegPath: string;
  pdfRasterizerPath: string;
  autoTagEnabled: boolean;
};

type WizardMode = 'new' | 'existing' | 'migrate';
type WizardStep =
  | 'intro'
  | 'new-location'
  | 'existing-location'
  | 'migrate-detect'
  | 'migrate-location'
  | 'migrate-confirm'
  | 'migrate-running'
  | 'migrate-complete'
  | 'sharing-setup'
  | 'ffmpeg-setup'
  | 'pdf-setup'
  | 'autotag-setup'
  | 'done';

const wizardCopy = {
  en: {
    stepLabel: (current: number, total: number) => `Step ${current} of ${total}`,
    welcomeTitle: 'Welcome to Caramel Board',
    welcomeBody: 'Pick how you want to start.',
    languageLabel: 'Language',
    english: 'English',
    japanese: '日本語',
    chooseNewTitle: 'Start fresh',
    chooseNewBody: 'Create an empty library on this computer.',
    chooseExistingTitle: 'Open an existing data store',
    chooseExistingBody: 'Use a Caramel Board folder you already have.',
    chooseMigrateTitle: 'Move from the previous version',
    chooseMigrateBody: 'Migrate data from the older command line version.',
    locationTitle: 'Where should your data live?',
    locationBody:
      'Caramel Board keeps the database and your files in one folder. You can change it later.',
    defaultLocationLabel: 'Use the standard app folder (recommended)',
    customLocationLabel: 'Choose another folder',
    chooseFolder: 'Choose folder',
    selectedFolder: 'Selected folder',
    detectExistingNotEmpty:
      'The folder already contains a Caramel Board data store. We will open it.',
    detectExistingEmpty: 'A new data store will be created here.',
    detectExistingNotEmptyOther:
      'The folder is not empty but is not a Caramel Board data store. Choose an empty folder.',
    detectExistingResettable:
      'This folder already has files. You can clear it and create a new data store here.',
    resetDataStoreTitle: 'Clear this folder and create a new data store?',
    resetDataStoreBody:
      'All files and folders inside the selected folder will be deleted. This is useful when setup was interrupted and left a partial data store.',
    resetDataStoreCancel: 'Choose another folder',
    resetDataStoreConfirm: 'Clear and create',
    resetDataStoreContinue: 'Clear and continue',
    existingTitle: 'Open your data store',
    existingBody:
      'Pick a folder that already contains your Caramel Board data (a caramel-board.sqlite file).',
    existingMissing:
      'No caramel-board.sqlite was found in the folder. Choose the folder that holds your data.',
    existingReady: 'Caramel Board data was found here.',
    migrateDetectTitle: 'Connect to the previous version',
    migrateDetectBody:
      'Start the previous Caramel Board (the command line version), then we will connect to it automatically.',
    migrateDetectChecking: 'Looking for the previous version…',
    migrateDetectFound: (datasets: number, stacks: number, assets: number) =>
      `Found ${datasets} libraries / ${stacks} stacks / ${assets} assets.`,
    migrateDetectNotFound: 'Could not find the previous version. Start it, then click Retry.',
    migrateLocationTitle: 'Where to put the migrated data?',
    migrateLocationBody:
      'A new data store will be created here. The migration copies your data into it.',
    migrateConfirmTitle: 'Ready to migrate',
    migrateConfirmBody:
      'Data from the previous version will be copied into the new data store. This can take some time depending on the size of the library.',
    migrateRunningTitle: 'Migrating…',
    migrateRunningBody:
      'Copying data into the new data store. Please leave the previous version running until this finishes.',
    migrateCompleteTitle: 'Import complete',
    migrateCompleteBody: 'Import is complete. You can quit the command line version now.',
    doneTitle: 'All set',
    doneBody: 'Setup is complete. Start Caramel Board now?',
    launchNetworkNote:
      'On first launch, Windows may ask to allow network access for Node.js or Python. Allow access on private networks if you want to open Caramel Board from this computer or other devices on your local network.',
    launchNow: 'Start Caramel Board',
    launchLater: 'Start later',
    launchPreparing: 'Starting Caramel Board…',
    launchPreparingBody: 'Getting the database ready. This can take a moment on first launch.',
    launchTimeout:
      'Caramel Board is taking longer than expected to start. It may still finish in the background — try opening the URL in a moment.',
    launchedTitle: 'Caramel Board is running',
    launchedBody: 'Open this URL in your browser to create your first library.',
    openInBrowser: 'Open in browser',
    goToSettings: 'Go to settings',
    finish: 'Open Caramel Board',
    next: 'Next',
    back: 'Back',
    retry: 'Retry',
    startMigration: 'Start migration',
    chooseExistingFolder: 'Open data store',
    advancedSourceTitle: 'Advanced source settings',
    advancedSourceBody: 'Only needed if the previous version used a custom database URL.',
    sourceDatabaseUrl: 'Database URL',
    sourceStorageRoot: 'Asset folder',
    sourceStorageRootTitle: 'Confirm the asset folder',
    sourceStorageRootBody:
      'Choose the existing asset folder from the previous version. Caramel Board will reuse this folder after migration.',
    sourceStorageRootMissing: 'Choose the asset folder before continuing.',
    chooseSourceStorageRoot: 'Choose asset folder',
    storageRootAdjustedInfo: (path: string) =>
      `Asset folder was adjusted to a likely library location: ${path}`,
    storageRootCheckHint:
      'Choose the folder that contains numbered library folders such as 1/assets/, 2/thumbnails/, or 2/files/.',
    sharingTitle: 'Share with other devices',
    sharingBody:
      'Caramel Board can be opened from other devices on the same network — phones, tablets, or another PC. In typical home networks only devices on your local network can reach it, but depending on your router setup it may also become reachable from the Internet. Direct Internet exposure is strongly discouraged — for remote access, use a VPN like Tailscale.',
    sharingAllow: 'Allow access from other devices on this network',
    sharingPasswordHint: 'When sharing is on, we recommend protecting it with a name and password.',
    sharingPasswordToggle: 'Protect the page with a password',
    sharingPasswordToggleHint:
      'Visitors will need a name and password to open the page. Recommended when other people share the network.',
    sharingUsername: 'Name',
    sharingPassword: 'Password',
    sharingPrivateBody:
      'Only this computer can open Caramel Board. You can turn this on later from the settings screen.',
    mediaTitle: 'Video & GIF previews',
    mediaBody:
      'Caramel Board uses FFmpeg to make previews of videos and GIFs. This is optional — you can set it up later from the settings screen.',
    mediaDetectedHeading: 'Detected FFmpeg',
    mediaDetectedHint: 'Pick the FFmpeg to use.',
    mediaNotFound: 'No FFmpeg was found on this computer.',
    mediaInstallHint:
      'After installing FFmpeg, click "Re-detect" or set it up later from the settings screen.',
    mediaInstallGuide: 'How to install FFmpeg',
    pdfTitle: 'PDF import',
    pdfBody:
      'Caramel Board uses Poppler to turn PDF pages into images. This is optional — you can set it up later from the settings screen.',
    pdfDetectedHeading: 'Detected Poppler',
    pdfDetectedHint: 'Pick the pdftocairo executable to use.',
    pdfNotFound: 'No pdftocairo executable was found on this computer.',
    pdfInstallHint:
      'After installing Poppler, click "Re-detect" or set it up later from the settings screen.',
    pdfInstallGuide: 'How to install Poppler',
    redetect: 'Re-detect',
    skipForNow: 'Skip for now',
    useThis: 'Use this',
    autoTagTitle: 'Auto-tagging',
    autoTagBody:
      'Caramel Board can automatically tag imported images and enable similar-image search using the open-source JoyTag model. Everything runs on this computer — your images are never sent anywhere, and they are never used to train AI. CUDA is not required for normal CPU tagging. If you want GPU acceleration and CUDA setup fails, install the latest NVIDIA driver and CUDA Toolkit, then try again.',
    aboutJoyTag: 'About JoyTag',
    autoTagEnable: 'I want to use auto-tagging',
    autoTagEnableHint:
      'The model will need to be downloaded. You can finish the install from the auto-tag settings screen after setup.',
    autoTagSkipHint: 'You can turn auto-tagging on later from the settings screen.',
    autoTagInstallNow: 'Install now',
    autoTagFetchMetadata: 'Checking model size…',
    autoTagConfirmTitle: 'Download model data',
    autoTagConfirmBody: (size: string) =>
      `About ${size} of data will be downloaded. Continue? CUDA is not required for CPU tagging. If you want GPU acceleration and CUDA setup fails, install the latest NVIDIA driver and CUDA Toolkit, then try again.`,
    autoTagInstallStart: 'Start install',
    autoTagInstalling: 'Installing auto-tag…',
    autoTagInstallDone: 'Auto-tag installation completed.',
    autoTagInstallFailed: 'Auto-tag installation failed.',
    autoTagAlreadyReady: 'Auto-tag is already installed.',
  },
  ja: {
    stepLabel: (current: number, total: number) => `Step ${current} / ${total}`,
    welcomeTitle: 'Caramel Board へようこそ',
    welcomeBody: 'はじめ方を選んでください。',
    languageLabel: '言語',
    english: 'English',
    japanese: '日本語',
    chooseNewTitle: '新しくはじめる',
    chooseNewBody: 'このコンピュータに空のライブラリを作ります。',
    chooseExistingTitle: '既存のデータストアを開く',
    chooseExistingBody: '今お持ちの Caramel Board のフォルダを開きます。',
    chooseMigrateTitle: '以前の版から引き継ぐ',
    chooseMigrateBody: '以前のコマンドライン版のデータを取り込みます。',
    locationTitle: 'データの保存先を選びましょう',
    locationBody:
      'Caramel Board はデータベースとファイルを 1 つのフォルダにまとめて保管します。後から変更できます。',
    defaultLocationLabel: 'アプリ標準フォルダを使う(推奨)',
    customLocationLabel: '別のフォルダを選ぶ',
    chooseFolder: 'フォルダを選ぶ',
    selectedFolder: '選択中のフォルダ',
    detectExistingNotEmpty: 'このフォルダには既存のデータストアがあります。そのまま開きます。',
    detectExistingEmpty: 'ここに新しいデータストアを作ります。',
    detectExistingNotEmptyOther:
      'フォルダが空ではありませんが、Caramel Board のデータストアではありません。空のフォルダを選んでください。',
    detectExistingResettable:
      'このフォルダには既に中身があります。中身をクリアして新しいデータストアを作成できます。',
    resetDataStoreTitle: 'このフォルダをクリアして新規作成しますか?',
    resetDataStoreBody:
      '選択したフォルダ内のファイルとフォルダをすべて削除します。セットアップが途中で止まり、作成途中のデータストアが残った場合に使います。',
    resetDataStoreCancel: '別のフォルダを選ぶ',
    resetDataStoreConfirm: 'クリアして作成',
    resetDataStoreContinue: 'クリアして次へ',
    existingTitle: 'データストアを開く',
    existingBody: 'caramel-board.sqlite が入っている、これまで使っていたフォルダを選んでください。',
    existingMissing:
      'フォルダ内に caramel-board.sqlite が見つかりませんでした。データが入っているフォルダを選んでください。',
    existingReady: 'データを見つけました。',
    migrateDetectTitle: '以前の版に接続する',
    migrateDetectBody:
      '以前の Caramel Board(コマンドライン版)を起動してください。自動的に接続します。',
    migrateDetectChecking: '接続を確認しています…',
    migrateDetectFound: (datasets: number, stacks: number, assets: number) =>
      `ライブラリ ${datasets} 件 / スタック ${stacks} 件 / アセット ${assets} 件 を見つけました。`,
    migrateDetectNotFound:
      '以前の版に接続できませんでした。起動してから「もう一度確認」を押してください。',
    migrateLocationTitle: '引き継いだデータの保存先',
    migrateLocationBody: 'この場所に新しいデータストアを作り、引き継ぎデータを保存します。',
    migrateConfirmTitle: '引き継ぎの準備ができました',
    migrateConfirmBody:
      '以前の版のデータを新しいデータストアにコピーします。ライブラリの量によっては時間がかかります。',
    migrateRunningTitle: '引き継ぎ中…',
    migrateRunningBody:
      'データをコピーしています。完了するまで以前の版は起動したままにしてください。',
    migrateCompleteTitle: '取り込みが完了しました',
    migrateCompleteBody: '取り込み完了しました。コマンドライン版は終了できます。',
    doneTitle: '準備ができました',
    doneBody: 'セットアップが完了しました。Caramel Board を起動しますか?',
    launchNetworkNote:
      '初回起動時に、Windows が Node.js や Python のネットワークアクセス許可を求める場合があります。この PC や同じネットワーク上の機器から Caramel Board を開く場合は、プライベートネットワークでのアクセスを許可してください。',
    launchNow: 'Caramel Board を起動',
    launchLater: 'あとで起動する',
    launchPreparing: 'Caramel Board を起動しています…',
    launchPreparingBody: 'データベースを準備しています。初回起動は少し時間がかかることがあります。',
    launchTimeout:
      '起動に時間がかかっています。バックグラウンドで準備が続いている可能性があるため、しばらくしてから URL を開いてみてください。',
    launchedTitle: 'Caramel Board が起動しました',
    launchedBody: 'ブラウザでこの URL を開いて、最初のライブラリを作成しましょう。',
    openInBrowser: 'ブラウザで開く',
    goToSettings: '設定画面へ',
    finish: 'Caramel Board を開く',
    next: '次へ',
    back: '戻る',
    retry: 'もう一度確認',
    startMigration: '引き継ぎを開始',
    chooseExistingFolder: 'データストアを開く',
    advancedSourceTitle: '取り込み元の詳細設定',
    advancedSourceBody: '以前の版で接続先 URL を変えていた場合のみ使います。',
    sourceDatabaseUrl: 'データベース URL',
    sourceStorageRoot: 'アセットフォルダ',
    sourceStorageRootTitle: 'アセットフォルダを確認',
    sourceStorageRootBody:
      '以前の版で取り込んだ画像や動画ファイルが入っている既存フォルダを選んでください。移行後もこのフォルダを再利用します。',
    sourceStorageRootMissing: '続ける前にアセットフォルダを選んでください。',
    chooseSourceStorageRoot: 'アセットフォルダを選ぶ',
    storageRootAdjustedInfo: (path: string) => `アセットフォルダを自動で補正しました: ${path}`,
    storageRootCheckHint:
      '1/assets/、2/thumbnails/、2/files/ などの番号付きフォルダがある階層を選んでください。',
    sharingTitle: '他の機器からのアクセス',
    sharingBody:
      '同じネットワーク上のスマートフォン・タブレット・別の PC から Caramel Board を開けるようにできます。通常はローカルネットワーク内からのみアクセスできますが、ルーターや環境によってはインターネットからアクセスできる場合があります。インターネットへの直接公開は強く非推奨です。外出先からアクセスしたい場合は Tailscale などの VPN 経由を推奨します。',
    sharingAllow: '同じネットワーク上の他の機器からのアクセスを許可する',
    sharingPasswordHint: '共有を有効にする場合は、名前とパスワードでの保護を推奨します。',
    sharingPasswordToggle: 'ページをパスワードで保護する',
    sharingPasswordToggleHint:
      'ページにアクセスするために、名前とパスワードが必要になります。他の人が参加しているネットワークの場合、設定を推奨します。',
    sharingUsername: '名前',
    sharingPassword: 'パスワード',
    sharingPrivateBody:
      'このコンピュータからのみ Caramel Board を開けます。後から設定画面で有効化できます。',
    mediaTitle: '動画・GIF プレビュー',
    mediaBody:
      '動画と GIF のプレビュー生成には FFmpeg を使います。任意の設定です。後から設定画面で設定することもできます。',
    mediaDetectedHeading: '検出された FFmpeg',
    mediaDetectedHint: '使う FFmpeg を選んでください。',
    mediaNotFound: 'このコンピュータに FFmpeg は見つかりませんでした。',
    mediaInstallHint: 'FFmpeg をインストールして「再検出」を押すか、後から設定画面で設定できます。',
    mediaInstallGuide: 'FFmpeg のインストール方法',
    pdfTitle: 'PDF 取り込み',
    pdfBody:
      'PDF ページを画像に変換するために Poppler を使います。任意の設定です。後から設定画面で設定することもできます。',
    pdfDetectedHeading: '検出された Poppler',
    pdfDetectedHint: '使用する pdftocairo を選んでください。',
    pdfNotFound: 'このコンピュータに pdftocairo は見つかりませんでした。',
    pdfInstallHint: 'Poppler をインストールして「再検出」を押すか、後から設定画面で設定できます。',
    pdfInstallGuide: 'Poppler のインストール方法',
    redetect: '再検出',
    skipForNow: 'あとで設定する',
    useThis: 'これを使う',
    autoTagTitle: '自動タグ',
    autoTagBody:
      '自動タグを使うと、取り込んだ画像に自動でタグを付け、類似画像検索など画像ベースの検索に活用できます。オープンソースの JoyTag モデルでローカル処理し、画像が外部に送信されたり、AI の学習に使われたりすることはありません。通常の CPU タグ付けに CUDA は不要です。GPU 高速化を使いたい場合に CUDA のセットアップで失敗したら、最新の NVIDIA ドライバーと CUDA Toolkit をインストールしてから再試行してください。',
    aboutJoyTag: 'JoyTag について',
    autoTagEnable: '自動タグを使う',
    autoTagEnableHint:
      'モデルのダウンロードが必要です。セットアップ完了後、自動タグの設定画面でインストールを完了できます。',
    autoTagSkipHint: '自動タグは後から設定画面で有効化できます。',
    autoTagInstallNow: 'いまインストールする',
    autoTagFetchMetadata: 'モデルサイズを取得中…',
    autoTagConfirmTitle: 'モデルのダウンロード',
    autoTagConfirmBody: (size: string) =>
      `約 ${size} のデータをダウンロードします。続けますか? CPU でのタグ付けに CUDA は不要です。GPU 高速化を使いたい場合に CUDA のセットアップで失敗したら、最新の NVIDIA ドライバーと CUDA Toolkit をインストールしてから再試行してください。`,
    autoTagInstallStart: 'インストールを開始',
    autoTagInstalling: '自動タグをインストール中…',
    autoTagInstallDone: '自動タグのインストールが完了しました。',
    autoTagInstallFailed: '自動タグのインストールに失敗しました。',
    autoTagAlreadyReady: '自動タグはすでにインストール済みです。',
  },
} as const;

interface SetupWizardProps {
  language: WizardLanguage;
  initialSettings: FullSettings;
  defaultDataStoreRoot: string;
  onLanguageChange: (next: WizardLanguage) => void;
  onComplete: (settings: unknown) => void;
}

const FFMPEG_INSTALL_URL = 'https://ffmpeg.org/download.html';
const POPPLER_WINDOWS_INSTALL_URL = 'https://github.com/oschwartz10612/poppler-windows/releases';
const POPPLER_MACOS_INSTALL_URL = 'https://formulae.brew.sh/formula/poppler';
const JOYTAG_URL = 'https://github.com/fpgaminer/joytag';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const dataStoreHasContents = (inspection: DataStoreInspection | null) =>
  Boolean(
    inspection?.exists && (!inspection.isEmpty || inspection.hasDatabase || inspection.hasLibrary)
  );

export function SetupWizard({
  language,
  initialSettings,
  defaultDataStoreRoot,
  onLanguageChange,
  onComplete,
}: SetupWizardProps) {
  const t = wizardCopy[language];
  const [step, setStep] = useState<WizardStep>('intro');
  const [mode, setMode] = useState<WizardMode>('new');
  const [useDefault, setUseDefault] = useState(true);
  const [customPath, setCustomPath] = useState('');
  const [existingPath, setExistingPath] = useState('');
  const [inspection, setInspection] = useState<DataStoreInspection | null>(null);
  const [detection, setDetection] = useState<DockerSourceDetection | null>(null);
  const [detectionAttempted, setDetectionAttempted] = useState(false);
  const [sourceDatabaseUrl, setSourceDatabaseUrl] = useState(initialSettings.dockerDatabaseUrl);
  const [sourceStorageRoot, setSourceStorageRoot] = useState(initialSettings.dockerStorageRoot);
  const [sourceStorageRootTouched, setSourceStorageRootTouched] = useState(false);
  const [storageRootAdjusted, setStorageRootAdjusted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appliedSettings, setAppliedSettings] = useState<FullSettings | null>(null);
  const [ffmpegCandidates, setFfmpegCandidates] = useState<FfmpegCandidate[]>([]);
  const [selectedFfmpegPath, setSelectedFfmpegPath] = useState<string>(
    initialSettings.ffmpegPath ?? ''
  );
  const [pdfRasterizerCandidates, setPdfRasterizerCandidates] = useState<PdfRasterizerCandidate[]>(
    []
  );
  const [selectedPdfRasterizerPath, setSelectedPdfRasterizerPath] = useState<string>(
    initialSettings.pdfRasterizerPath ?? ''
  );
  const [autoTagStatus, setAutoTagStatus] = useState<AutoTagStatus | null>(null);
  const [sharingAllow, setSharingAllow] = useState(initialSettings.allowExternalNetwork ?? false);
  const [sharingRequireAuth, setSharingRequireAuth] = useState(
    initialSettings.basicAuthEnabled ?? false
  );
  const [sharingUsername, setSharingUsername] = useState(initialSettings.basicAuthUsername ?? '');
  const [sharingPassword, setSharingPassword] = useState(initialSettings.basicAuthPassword ?? '');
  const [autoTagPhase, setAutoTagPhase] = useState<AutoTagInstallPhase>('idle');
  const [autoTagMetadata, setAutoTagMetadata] = useState<AutoTagInstallMetadata | null>(null);
  const [autoTagProgress, setAutoTagProgress] = useState<AutoTagInstallProgress | null>(null);
  const [dockerMigrationProgress, setDockerMigrationProgress] =
    useState<DockerMigrationProgress | null>(null);
  const [launchPhase, setLaunchPhase] = useState<'idle' | 'starting' | 'ready'>('idle');
  const [launchedUrl, setLaunchedUrl] = useState('');
  const [resetDataStoreConfirmOpen, setResetDataStoreConfirmOpen] = useState(false);

  const targetPath = useDefault ? defaultDataStoreRoot : customPath;

  const totalSteps = 7;

  const currentStepIndex = useMemo(() => {
    switch (step) {
      case 'intro':
        return 1;
      case 'new-location':
      case 'existing-location':
      case 'migrate-detect':
      case 'migrate-location':
      case 'migrate-confirm':
      case 'migrate-running':
      case 'migrate-complete':
        return 2;
      case 'sharing-setup':
        return 3;
      case 'ffmpeg-setup':
        return 4;
      case 'pdf-setup':
        return 5;
      case 'autotag-setup':
        return 6;
      case 'done':
        return 7;
      default:
        return 1;
    }
  }, [step]);

  const inspectTarget = useCallback(async (root: string) => {
    if (!root.trim()) {
      setInspection(null);
      return null;
    }
    try {
      const result = await invoke<DataStoreInspection>('inspect_data_store', {
        path: root,
      });
      setInspection(result);
      return result;
    } catch (err) {
      setInspection(null);
      setError(errorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    if (step === 'new-location' || step === 'migrate-location') {
      void inspectTarget(targetPath);
    }
  }, [step, targetPath, inspectTarget]);

  const handleChooseFolder = useCallback(async () => {
    setError('');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;
    setUseDefault(false);
    setCustomPath(selected);
  }, []);

  const handleChooseExistingFolder = useCallback(async () => {
    setError('');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;
    setExistingPath(selected);
    await inspectTarget(selected);
  }, [inspectTarget]);

  const handleChooseSourceStorageRoot = useCallback(async () => {
    setError('');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;
    try {
      const resolved = await invoke<DockerStorageResolution>('resolve_docker_storage_root', {
        path: selected,
      });
      setSourceStorageRoot(resolved.resolved);
      setSourceStorageRootTouched(true);
      setStorageRootAdjusted(resolved.adjusted);
    } catch (err) {
      setSourceStorageRoot(selected);
      setSourceStorageRootTouched(true);
      setStorageRootAdjusted(false);
      setError(errorMessage(err));
    }
  }, []);

  const runDetect = useCallback(async () => {
    setBusy(true);
    setError('');
    setDetectionAttempted(true);
    try {
      const next = await invoke<DockerSourceDetection>('detect_docker_source', {
        settings: {
          ...initialSettings,
          dockerDatabaseUrl: sourceDatabaseUrl,
          dockerStorageRoot: sourceStorageRoot,
        },
      });
      setDetection(next);
      if (!sourceStorageRootTouched && next.storageRoot.trim()) {
        setSourceStorageRoot(next.storageRoot);
        setStorageRootAdjusted(false);
      }
    } catch (err) {
      setDetection(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [initialSettings, sourceDatabaseUrl, sourceStorageRoot, sourceStorageRootTouched]);

  useEffect(() => {
    if (step !== 'migrate-detect' || detectionAttempted) return;
    void runDetect();
  }, [step, detectionAttempted, runDetect]);

  const handleSelectMode = useCallback((next: WizardMode) => {
    setError('');
    setMode(next);
    if (next === 'new') {
      setStep('new-location');
      setUseDefault(true);
    } else if (next === 'existing') {
      setStep('existing-location');
      setExistingPath('');
      setInspection(null);
    } else {
      setStep('migrate-detect');
      setDetectionAttempted(false);
      setDetection(null);
      setSourceStorageRootTouched(false);
      setStorageRootAdjusted(false);
    }
  }, []);

  const handleApplyDataStore = useCallback(
    async (
      root: string,
      options: {
        resetExisting?: boolean;
        setupCompleted?: boolean;
        carryExistingData?: boolean;
      } = {}
    ) => {
      const applied = await invoke<FullSettings>('apply_data_store', {
        rootPath: root,
        resetExisting: options.resetExisting ?? false,
        setupCompleted: options.setupCompleted ?? false,
        carryExistingData: options.carryExistingData ?? false,
      });
      // intro 画面で選んだ言語が、ディスク再読込の結果で巻き戻らないようにマージする
      return { ...applied, language };
    },
    [language]
  );

  const handleConfirmNew = useCallback(
    async (resetExisting = false) => {
      if (!targetPath.trim()) return;
      setBusy(true);
      setError('');
      try {
        const latestInspection = (await inspectTarget(targetPath)) ?? inspection;
        if (!resetExisting && dataStoreHasContents(latestInspection)) {
          setResetDataStoreConfirmOpen(true);
          return;
        }
        const applied = await handleApplyDataStore(targetPath, {
          resetExisting,
          setupCompleted: false,
          carryExistingData: false,
        });
        setAppliedSettings(applied as FullSettings);
        setStep('sharing-setup');
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [targetPath, inspectTarget, inspection, handleApplyDataStore]
  );

  const handleConfirmExisting = useCallback(async () => {
    if (!existingPath.trim()) return;
    setBusy(true);
    setError('');
    try {
      const applied = await handleApplyDataStore(existingPath, {
        setupCompleted: false,
        carryExistingData: false,
      });
      setAppliedSettings(applied as FullSettings);
      setStep('sharing-setup');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [existingPath, handleApplyDataStore]);

  const handleClearMigrationTarget = useCallback(async () => {
    if (!targetPath.trim()) return;
    setBusy(true);
    setError('');
    try {
      const applied = await handleApplyDataStore(targetPath, {
        resetExisting: true,
        setupCompleted: false,
        carryExistingData: false,
      });
      setAppliedSettings(applied as FullSettings);
      await inspectTarget(targetPath);
      setStep('migrate-confirm');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [targetPath, handleApplyDataStore, inspectTarget]);

  const refreshDockerMigrationProgress = useCallback(async () => {
    const next = await invoke<DockerMigrationProgress>('docker_migration_progress');
    setDockerMigrationProgress(next);
    if (next.completed && !next.error) {
      const loaded = await invoke<FullSettings>('load_settings');
      setAppliedSettings({ ...loaded, language });
    }
    return next;
  }, [language]);

  const handleConfirmMigrate = useCallback(async () => {
    if (!targetPath.trim() || !sourceStorageRoot.trim()) return;
    setStep('migrate-running');
    setBusy(true);
    setError('');
    try {
      const applied = await handleApplyDataStore(targetPath, {
        setupCompleted: false,
        carryExistingData: false,
      });
      const settingsForMigration = {
        ...applied,
        dockerDatabaseUrl: sourceDatabaseUrl,
        dockerStorageRoot: sourceStorageRoot,
      };
      setDockerMigrationProgress({
        running: true,
        completed: false,
        phase: 'starting',
        message: t.migrateRunningTitle,
        percent: 0,
        lastLog: '',
        exportDir: null,
        dbPath: applied.dbPath,
        error: null,
      });
      let completedImmediately = false;
      try {
        const progress = await invoke<DockerMigrationProgress>('start_docker_migration', {
          settings: settingsForMigration,
        });
        setDockerMigrationProgress(progress);
        if (progress.completed && !progress.error) {
          completedImmediately = true;
          const loaded = await invoke<FullSettings>('load_settings');
          setAppliedSettings({ ...loaded, language });
          setStep('migrate-complete');
        } else if (progress.error) {
          setError(progress.error);
          setStep('migrate-confirm');
        }
      } catch (err) {
        await refreshDockerMigrationProgress().catch(() => undefined);
        throw err;
      }
      if (!completedImmediately) {
        setAppliedSettings(applied as FullSettings);
      }
    } catch (err) {
      setError(errorMessage(err));
      setStep('migrate-confirm');
    } finally {
      setBusy(false);
    }
  }, [
    targetPath,
    handleApplyDataStore,
    sourceDatabaseUrl,
    sourceStorageRoot,
    refreshDockerMigrationProgress,
    language,
    t.migrateRunningTitle,
  ]);

  const completeWizard = useCallback(async () => {
    const completed = await invoke<FullSettings>('complete_setup');
    const merged = { ...completed, language };
    setAppliedSettings(merged);
    return merged;
  }, [language]);

  const handleFinish = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    try {
      const completed = await completeWizard();
      onComplete(completed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, completeWizard, onComplete]);

  const handleLaunch = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    setLaunchPhase('starting');
    try {
      const completed = await completeWizard();
      const next = await invoke<SidecarStatus>('start_sidecar', {
        settings: completed,
      });
      let url = next.url;
      if (completed.allowExternalNetwork) {
        try {
          const ip = await invoke<string>('local_ip_address');
          if (ip && ip !== '127.0.0.1') {
            url = `http://${ip}:${completed.port}`;
          }
        } catch {
          // LAN IP が取れなくてもローカル URL で続行
        }
      }
      setLaunchedUrl(url);
      const ready = await invoke<boolean>('wait_server_ready', {
        port: completed.port,
        timeoutMs: 60000,
      });
      if (ready) {
        setLaunchPhase('ready');
      } else {
        setLaunchPhase('idle');
        setError(t.launchTimeout);
      }
    } catch (err) {
      setLaunchPhase('idle');
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, completeWizard, t]);

  const handleOpenLaunchedUrl = useCallback(() => {
    if (launchedUrl) {
      void openUrl(launchedUrl);
    }
  }, [launchedUrl]);

  const handleConfirmSharing = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    try {
      const next = await invoke<FullSettings>('save_settings', {
        settings: {
          ...appliedSettings,
          allowExternalNetwork: sharingAllow,
          basicAuthEnabled: sharingAllow ? sharingRequireAuth : false,
          basicAuthUsername: sharingUsername,
          basicAuthPassword: sharingPassword,
        },
      });
      setAppliedSettings(next);
      setStep('ffmpeg-setup');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, sharingAllow, sharingRequireAuth, sharingUsername, sharingPassword]);

  const refreshFfmpeg = useCallback(async () => {
    if (!appliedSettings) return;
    try {
      const next = await invoke<FfmpegCandidate[]>('detect_ffmpeg', {
        settings: appliedSettings,
      });
      setFfmpegCandidates(next);
      setSelectedFfmpegPath((current) => {
        if (current) {
          const stillValid = next.find((c) => c.path === current && c.valid);
          if (stillValid) return current;
        }
        const valid = next.find((c) => c.valid);
        return valid?.path ?? '';
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [appliedSettings]);

  useEffect(() => {
    if (step !== 'ffmpeg-setup' || !appliedSettings) return;
    void refreshFfmpeg();
  }, [step, appliedSettings, refreshFfmpeg]);

  const handleUseFfmpeg = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    try {
      const next = await invoke<FullSettings>('save_settings', {
        settings: { ...appliedSettings, ffmpegPath: selectedFfmpegPath || '' },
      });
      setAppliedSettings(next);
      setStep('pdf-setup');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, selectedFfmpegPath]);

  const handleSkipFfmpeg = useCallback(() => {
    setStep('pdf-setup');
  }, []);

  const refreshPdfRasterizer = useCallback(async () => {
    if (!appliedSettings) return;
    try {
      const next = await invoke<PdfRasterizerCandidate[]>('detect_pdf_rasterizer', {
        settings: appliedSettings,
      });
      setPdfRasterizerCandidates(next);
      setSelectedPdfRasterizerPath((current) => {
        if (current) {
          const stillValid = next.find(
            (candidate) => candidate.path === current && candidate.valid
          );
          if (stillValid) return current;
        }
        const valid = next.find((candidate) => candidate.valid);
        return valid?.path ?? '';
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [appliedSettings]);

  useEffect(() => {
    if (step !== 'pdf-setup' || !appliedSettings) return;
    void refreshPdfRasterizer();
  }, [step, appliedSettings, refreshPdfRasterizer]);

  const handleUsePdfRasterizer = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    try {
      const next = await invoke<FullSettings>('save_settings', {
        settings: { ...appliedSettings, pdfRasterizerPath: selectedPdfRasterizerPath || '' },
      });
      setAppliedSettings(next);
      setStep('autotag-setup');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, selectedPdfRasterizerPath]);

  const handleSkipPdfRasterizer = useCallback(() => {
    setStep('autotag-setup');
  }, []);

  const refreshAutoTagStatus = useCallback(async () => {
    try {
      const next = await invoke<AutoTagStatus>('autotag_status');
      setAutoTagStatus(next);
    } catch {
      // 起動前のチェックでは無視
    }
  }, []);

  useEffect(() => {
    if (step !== 'autotag-setup') return;
    void refreshAutoTagStatus();
  }, [step, refreshAutoTagStatus]);

  const handleEnableAutoTag = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    try {
      const next = await invoke<FullSettings>('save_settings', {
        settings: { ...appliedSettings, autoTagEnabled: true },
      });
      setAppliedSettings(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [appliedSettings]);

  const handleSkipAutoTag = useCallback(() => {
    setStep('done');
  }, []);

  const handleStartAutoTagInstall = useCallback(async () => {
    if (!appliedSettings) return;
    setBusy(true);
    setError('');
    setAutoTagPhase('metadata');
    try {
      const metadata = await invoke<AutoTagInstallMetadata>('autotag_install_metadata', {
        settings: appliedSettings,
      });
      setAutoTagMetadata(metadata);
      setAutoTagPhase('confirm');
    } catch (err) {
      setError(errorMessage(err));
      setAutoTagPhase('idle');
    } finally {
      setBusy(false);
    }
  }, [appliedSettings]);

  const handleConfirmAutoTagInstall = useCallback(async () => {
    if (!appliedSettings || !autoTagMetadata) return;
    setBusy(true);
    setError('');
    try {
      const progress = await invoke<AutoTagInstallProgress>('start_autotag_install', {
        settings: appliedSettings,
        metadata: autoTagMetadata,
      });
      setAutoTagProgress(progress);
      setAutoTagPhase('progress');
    } catch (err) {
      setError(errorMessage(err));
      setAutoTagPhase('idle');
    } finally {
      setBusy(false);
    }
  }, [appliedSettings, autoTagMetadata]);

  useEffect(() => {
    if (step !== 'autotag-setup') return;
    if (autoTagPhase !== 'progress') return;
    if (autoTagProgress && !autoTagProgress.running) return;

    const timer = window.setInterval(async () => {
      try {
        const next = await invoke<AutoTagInstallProgress>('autotag_install_progress');
        setAutoTagProgress(next);
        if (next.completed && !next.error) {
          setAutoTagPhase('done');
          window.clearInterval(timer);
          try {
            const saved = await invoke<FullSettings>('save_settings', {
              settings: { ...appliedSettings, autoTagEnabled: true } as FullSettings,
            });
            setAppliedSettings(saved);
            await refreshAutoTagStatus();
          } catch (err) {
            setError(errorMessage(err));
          }
        } else if (next.error) {
          setAutoTagPhase('failed');
          setError('');
          window.clearInterval(timer);
        }
      } catch (err) {
        setError(errorMessage(err));
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, autoTagPhase, autoTagProgress, appliedSettings, refreshAutoTagStatus]);

  useEffect(() => {
    if (step !== 'migrate-running') return;
    if (!dockerMigrationProgress?.running) return;

    const timer = window.setInterval(async () => {
      try {
        const next = await refreshDockerMigrationProgress();
        if (next.completed && !next.error) {
          setStep('migrate-complete');
          window.clearInterval(timer);
        } else if (next.error) {
          setError(next.error);
          setStep('migrate-confirm');
          window.clearInterval(timer);
        }
      } catch (err) {
        setError(errorMessage(err));
        setStep('migrate-confirm');
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, dockerMigrationProgress?.running, refreshDockerMigrationProgress]);

  const handleProceedFromAutoTag = useCallback(() => {
    setStep('done');
  }, []);

  const handleOpenFfmpegInstallGuide = useCallback(() => {
    void openUrl(FFMPEG_INSTALL_URL);
  }, []);

  const handleOpenPopplerInstallGuide = useCallback(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    void openUrl(isMac ? POPPLER_MACOS_INSTALL_URL : POPPLER_WINDOWS_INSTALL_URL);
  }, []);

  const renderIntro = () => (
    <>
      <div className="wizard-language-row" aria-label={t.languageLabel}>
        <div className="wizard-language-segment" role="group">
          <button
            type="button"
            className={language === 'en' ? 'segment-button active' : 'segment-button'}
            onClick={() => onLanguageChange('en')}
          >
            {t.english}
          </button>
          <button
            type="button"
            className={language === 'ja' ? 'segment-button active' : 'segment-button'}
            onClick={() => onLanguageChange('ja')}
          >
            {t.japanese}
          </button>
        </div>
      </div>
      <div className="wizard-heading">
        <h1>{t.welcomeTitle}</h1>
        <p>{t.welcomeBody}</p>
      </div>
      <div className="wizard-choice-list">
        <button type="button" className="wizard-choice" onClick={() => handleSelectMode('new')}>
          <span className="wizard-choice-icon">
            <Sparkles size={18} />
          </span>
          <span className="wizard-choice-body">
            <strong>{t.chooseNewTitle}</strong>
            <span>{t.chooseNewBody}</span>
          </span>
        </button>
        <button
          type="button"
          className="wizard-choice"
          onClick={() => handleSelectMode('existing')}
        >
          <span className="wizard-choice-icon">
            <FolderOpen size={18} />
          </span>
          <span className="wizard-choice-body">
            <strong>{t.chooseExistingTitle}</strong>
            <span>{t.chooseExistingBody}</span>
          </span>
        </button>
        <button type="button" className="wizard-choice" onClick={() => handleSelectMode('migrate')}>
          <span className="wizard-choice-icon">
            <Download size={18} />
          </span>
          <span className="wizard-choice-body">
            <strong>{t.chooseMigrateTitle}</strong>
            <span>{t.chooseMigrateBody}</span>
          </span>
        </button>
      </div>
    </>
  );

  const renderLocationBody = (forMigration: boolean) => {
    const inspectionHint = (() => {
      if (!targetPath.trim()) return null;
      if (!inspection) return null;
      if (!forMigration && dataStoreHasContents(inspection)) {
        return (
          <div className="wizard-path-card warn">
            <strong>{t.detectExistingResettable}</strong>
            <span>{inspection.path}</span>
          </div>
        );
      }
      if (inspection.hasDatabase) {
        return (
          <div className="wizard-path-card">
            <strong>{t.detectExistingNotEmpty}</strong>
            <span>{inspection.path}</span>
          </div>
        );
      }
      if (inspection.exists && !inspection.isEmpty) {
        return (
          <div className="wizard-path-card warn">
            <strong>{t.detectExistingNotEmptyOther}</strong>
            <span>{inspection.path}</span>
          </div>
        );
      }
      return (
        <div className="wizard-path-card">
          <strong>{t.detectExistingEmpty}</strong>
          <span>{inspection.path || targetPath}</span>
        </div>
      );
    })();

    const canClearForMigration =
      forMigration && inspection?.exists && !inspection.isEmpty && !inspection.hasDatabase;
    const blocked = !targetPath.trim();

    return (
      <>
        <div className="wizard-heading">
          <h1>{forMigration ? t.migrateLocationTitle : t.locationTitle}</h1>
          <p>{forMigration ? t.migrateLocationBody : t.locationBody}</p>
        </div>
        <div className="wizard-choice-list">
          <label className="wizard-choice" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="wizard-location"
              checked={useDefault}
              onChange={() => setUseDefault(true)}
              style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
            />
            <span className="wizard-choice-body">
              <strong>{t.defaultLocationLabel}</strong>
              <span>{defaultDataStoreRoot}</span>
            </span>
          </label>
          <label className="wizard-choice" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="wizard-location"
              checked={!useDefault}
              onChange={() => setUseDefault(false)}
              style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
            />
            <span className="wizard-choice-body">
              <strong>{t.customLocationLabel}</strong>
              <span>{customPath || '—'}</span>
            </span>
          </label>
        </div>
        {!useDefault ? (
          <div className="wizard-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" onClick={handleChooseFolder} disabled={busy}>
              <Folder size={15} />
              {t.chooseFolder}
            </button>
          </div>
        ) : null}
        {inspectionHint}
        <div className="wizard-actions between">
          <button type="button" onClick={() => setStep('intro')} disabled={busy}>
            {t.back}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || blocked}
            onClick={() => {
              if (canClearForMigration) {
                setResetDataStoreConfirmOpen(true);
                return;
              }
              if (forMigration) {
                setStep('migrate-confirm');
              } else {
                void handleConfirmNew();
              }
            }}
          >
            {canClearForMigration ? <AlertCircle size={15} /> : <ArrowRight size={15} />}
            {canClearForMigration ? t.resetDataStoreContinue : t.next}
          </button>
        </div>
      </>
    );
  };

  const renderExistingLocation = () => {
    const ready = inspection?.hasDatabase ?? false;
    return (
      <>
        <div className="wizard-heading">
          <h1>{t.existingTitle}</h1>
          <p>{t.existingBody}</p>
        </div>
        <div className="wizard-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" onClick={handleChooseExistingFolder} disabled={busy}>
            <FolderOpen size={15} />
            {t.chooseFolder}
          </button>
        </div>
        {existingPath ? (
          <div className={ready ? 'wizard-path-card' : 'wizard-path-card warn'}>
            <strong>{ready ? t.existingReady : t.existingMissing}</strong>
            <span>{existingPath}</span>
          </div>
        ) : null}
        <div className="wizard-actions between">
          <button type="button" onClick={() => setStep('intro')} disabled={busy}>
            {t.back}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !ready}
            onClick={() => void handleConfirmExisting()}
          >
            <ArrowRight size={15} />
            {t.next}
          </button>
        </div>
      </>
    );
  };

  const renderMigrateDetect = () => {
    const ready = detection?.available ?? false;
    const detectedStorageIsSelected = detection?.storageRoot === sourceStorageRoot;
    const sourceStorageExists =
      !detectedStorageIsSelected || detection?.storageRootExists !== false;
    const sourceStorageReady = sourceStorageRoot.trim().length > 0 && sourceStorageExists;
    return (
      <>
        <div className="wizard-heading">
          <h1>{t.migrateDetectTitle}</h1>
          <p>{t.migrateDetectBody}</p>
        </div>
        {busy ? (
          <div className="wizard-progress-card spinner">
            <span>{t.migrateDetectChecking}</span>
          </div>
        ) : ready && detection ? (
          <div className="wizard-path-card">
            <strong>
              {t.migrateDetectFound(
                detection.datasetCount,
                detection.stackCount,
                detection.assetCount
              )}
            </strong>
            <span>{detection.databaseUrl}</span>
          </div>
        ) : (
          <div className="wizard-path-card warn">
            <strong>{t.migrateDetectNotFound}</strong>
            <span>{detection?.message ?? ''}</span>
          </div>
        )}
        <div className={sourceStorageReady ? 'wizard-path-card' : 'wizard-path-card warn'}>
          <strong>
            {sourceStorageReady ? t.sourceStorageRootTitle : t.sourceStorageRootMissing}
          </strong>
          <span>{sourceStorageRoot.trim() ? sourceStorageRoot : t.sourceStorageRootBody}</span>
        </div>
        <div className="wizard-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" onClick={handleChooseSourceStorageRoot} disabled={busy}>
            <Folder size={15} />
            {t.chooseSourceStorageRoot}
          </button>
        </div>
        {storageRootAdjusted ? (
          <p className="muted">{t.storageRootAdjustedInfo(sourceStorageRoot)}</p>
        ) : (
          <p className="muted">{t.storageRootCheckHint}</p>
        )}
        <details className="advanced-settings">
          <summary>{t.advancedSourceTitle}</summary>
          <p>{t.advancedSourceBody}</p>
          <label className="field">
            <span>{t.sourceDatabaseUrl}</span>
            <input
              value={sourceDatabaseUrl}
              onChange={(event) => setSourceDatabaseUrl(event.currentTarget.value)}
            />
          </label>
        </details>
        <div className="wizard-actions between">
          <button type="button" onClick={() => setStep('intro')} disabled={busy}>
            {t.back}
          </button>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void runDetect()} disabled={busy}>
              <RefreshCcw size={15} />
              {t.retry}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !ready || !sourceStorageReady}
              onClick={() => setStep('migrate-location')}
            >
              <ArrowRight size={15} />
              {t.next}
            </button>
          </span>
        </div>
      </>
    );
  };

  const renderMigrateConfirm = () => (
    <>
      <div className="wizard-heading">
        <h1>{t.migrateConfirmTitle}</h1>
        <p>{t.migrateConfirmBody}</p>
      </div>
      <div className="wizard-path-card">
        <strong>{t.selectedFolder}</strong>
        <span>{targetPath}</span>
      </div>
      <div className="wizard-path-card">
        <strong>{t.sourceStorageRoot}</strong>
        <span>{sourceStorageRoot}</span>
      </div>
      {detection ? (
        <div className="wizard-path-card">
          <strong>
            {t.migrateDetectFound(
              detection.datasetCount,
              detection.stackCount,
              detection.assetCount
            )}
          </strong>
          <span>{detection.databaseUrl}</span>
        </div>
      ) : null}
      <div className="wizard-actions between">
        <button type="button" onClick={() => setStep('migrate-location')} disabled={busy}>
          {t.back}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => void handleConfirmMigrate()}
        >
          <Database size={15} />
          {t.startMigration}
        </button>
      </div>
    </>
  );

  const renderMigrateRunning = () => (
    <>
      <div className="wizard-heading">
        <h1>{t.migrateRunningTitle}</h1>
        <p>{t.migrateRunningBody}</p>
      </div>
      <div
        className={
          dockerMigrationProgress?.running ? 'wizard-progress-card spinner' : 'wizard-progress-card'
        }
      >
        <span>{dockerMigrationProgress?.message || t.migrateRunningTitle}</span>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.round(dockerMigrationProgress?.percent ?? 0)}%` }}
          />
        </div>
        <span className="muted">{Math.round(dockerMigrationProgress?.percent ?? 0)}%</span>
        {dockerMigrationProgress?.lastLog ? (
          <span className="muted">{dockerMigrationProgress.lastLog}</span>
        ) : null}
      </div>
    </>
  );

  const renderMigrateComplete = () => (
    <>
      <div className="wizard-heading">
        <h1>{t.migrateCompleteTitle}</h1>
        <p>{t.migrateCompleteBody}</p>
      </div>
      <div className="wizard-path-card">
        <strong>{t.selectedFolder}</strong>
        <span>{targetPath}</span>
      </div>
      {sourceStorageRoot.trim() ? (
        <div className="wizard-path-card">
          <strong>{t.sourceStorageRoot}</strong>
          <span>{sourceStorageRoot}</span>
        </div>
      ) : null}
      <div className="wizard-actions" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="primary-button"
          onClick={() => setStep('sharing-setup')}
          disabled={busy}
        >
          <ArrowRight size={15} />
          {t.next}
        </button>
      </div>
    </>
  );

  const renderSharingSetup = () => (
    <>
      <div className="wizard-heading">
        <h1>{t.sharingTitle}</h1>
        <p>{t.sharingBody}</p>
      </div>
      <label className="wizard-choice" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={sharingAllow}
          onChange={(event) => setSharingAllow(event.currentTarget.checked)}
          style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
        />
        <span className="wizard-choice-body">
          <strong>{t.sharingAllow}</strong>
          <span>{sharingAllow ? t.sharingPasswordHint : t.sharingPrivateBody}</span>
        </span>
      </label>

      {sharingAllow ? (
        <>
          <label className="wizard-choice" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={sharingRequireAuth}
              onChange={(event) => setSharingRequireAuth(event.currentTarget.checked)}
              style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
            />
            <span className="wizard-choice-body">
              <strong>{t.sharingPasswordToggle}</strong>
              <span>{t.sharingPasswordToggleHint}</span>
            </span>
          </label>
          {sharingRequireAuth ? (
            <div className="auth-grid">
              <label className="field compact">
                <span>{t.sharingUsername}</span>
                <input
                  value={sharingUsername}
                  onChange={(event) => setSharingUsername(event.currentTarget.value)}
                />
              </label>
              <label className="field compact">
                <span>{t.sharingPassword}</span>
                <input
                  type="password"
                  value={sharingPassword}
                  onChange={(event) => setSharingPassword(event.currentTarget.value)}
                />
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="wizard-actions between">
        <button type="button" onClick={() => setStep('ffmpeg-setup')} disabled={busy}>
          {t.skipForNow}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => void handleConfirmSharing()}
          disabled={busy}
        >
          <ArrowRight size={15} />
          {t.next}
        </button>
      </div>
    </>
  );

  const renderFfmpegSetup = () => {
    const hasCandidates = ffmpegCandidates.length > 0;
    return (
      <>
        <div className="wizard-heading">
          <h1>{t.mediaTitle}</h1>
          <p>{t.mediaBody}</p>
        </div>
        {hasCandidates ? (
          <>
            <p className="muted">{t.mediaDetectedHint}</p>
            <div className="wizard-choice-list">
              {ffmpegCandidates.map((candidate) => (
                <label key={candidate.path} className="wizard-choice">
                  <input
                    type="radio"
                    name="wizard-ffmpeg"
                    checked={selectedFfmpegPath === candidate.path}
                    disabled={!candidate.valid}
                    onChange={() => setSelectedFfmpegPath(candidate.path)}
                    style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
                  />
                  <span className="wizard-choice-body">
                    <strong>{candidate.label}</strong>
                    <span>{candidate.path}</span>
                    {candidate.version ? <span>{candidate.version}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <div className="wizard-path-card warn">
            <strong>{t.mediaNotFound}</strong>
            <span>{t.mediaInstallHint}</span>
          </div>
        )}
        <div className="wizard-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => void refreshFfmpeg()} disabled={busy}>
            <RefreshCcw size={15} />
            {t.redetect}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={handleOpenFfmpegInstallGuide}
            disabled={busy}
          >
            <ExternalLink size={15} />
            {t.mediaInstallGuide}
          </button>
        </div>
        <div className="wizard-actions between">
          <button type="button" onClick={handleSkipFfmpeg} disabled={busy}>
            {t.skipForNow}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleUseFfmpeg()}
            disabled={busy || !hasCandidates || !selectedFfmpegPath}
          >
            <Film size={15} />
            {t.useThis}
          </button>
        </div>
      </>
    );
  };

  const renderPdfSetup = () => {
    const hasCandidates = pdfRasterizerCandidates.length > 0;
    return (
      <>
        <div className="wizard-heading">
          <h1>{t.pdfTitle}</h1>
          <p>{t.pdfBody}</p>
        </div>
        {hasCandidates ? (
          <>
            <p className="muted">{t.pdfDetectedHint}</p>
            <div className="wizard-choice-list">
              {pdfRasterizerCandidates.map((candidate) => (
                <label key={candidate.path} className="wizard-choice">
                  <input
                    type="radio"
                    name="wizard-pdf-rasterizer"
                    checked={selectedPdfRasterizerPath === candidate.path}
                    disabled={!candidate.valid}
                    onChange={() => setSelectedPdfRasterizerPath(candidate.path)}
                    style={{ width: 'auto', minHeight: 0, marginTop: 4 }}
                  />
                  <span className="wizard-choice-body">
                    <strong>{candidate.label}</strong>
                    <span>{candidate.path}</span>
                    {candidate.version ? <span>{candidate.version}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <div className="wizard-path-card warn">
            <strong>{t.pdfNotFound}</strong>
            <span>{t.pdfInstallHint}</span>
          </div>
        )}
        <div className="wizard-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => void refreshPdfRasterizer()} disabled={busy}>
            <RefreshCcw size={15} />
            {t.redetect}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={handleOpenPopplerInstallGuide}
            disabled={busy}
          >
            <ExternalLink size={15} />
            {t.pdfInstallGuide}
          </button>
        </div>
        <div className="wizard-actions between">
          <button type="button" onClick={handleSkipPdfRasterizer} disabled={busy}>
            {t.skipForNow}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleUsePdfRasterizer()}
            disabled={busy || !hasCandidates || !selectedPdfRasterizerPath}
          >
            <FileText size={15} />
            {t.useThis}
          </button>
        </div>
      </>
    );
  };

  const renderAutoTagSetup = () => {
    const alreadyReady = autoTagStatus?.ready ?? false;
    const phase = autoTagPhase;
    const progressPercent = autoTagProgress ? Math.round(autoTagProgress.percent) : 0;

    return (
      <>
        <div className="wizard-heading">
          <h1>{t.autoTagTitle}</h1>
          <p>{t.autoTagBody}</p>
          <button
            type="button"
            className="link-button"
            onClick={() => void openUrl(JOYTAG_URL)}
            disabled={busy}
          >
            <ExternalLink size={14} />
            {t.aboutJoyTag}
          </button>
        </div>

        {alreadyReady ? (
          <div className="wizard-path-card">
            <strong>{t.autoTagAlreadyReady}</strong>
            <span>{autoTagStatus?.message ?? ''}</span>
          </div>
        ) : phase === 'idle' ? (
          <div className="wizard-path-card">
            <strong>{t.autoTagEnableHint}</strong>
            <span>{autoTagStatus?.message ?? ''}</span>
          </div>
        ) : null}

        {phase === 'metadata' ? (
          <div className="wizard-progress-card spinner">
            <span>{t.autoTagFetchMetadata}</span>
          </div>
        ) : null}

        {phase === 'confirm' && autoTagMetadata ? (
          <div className="wizard-path-card">
            <strong>{t.autoTagConfirmTitle}</strong>
            <span>{t.autoTagConfirmBody(autoTagMetadata.downloadSize)}</span>
          </div>
        ) : null}

        {phase === 'progress' || phase === 'done' || phase === 'failed' ? (
          <div className="wizard-progress-card">
            <span>
              {phase === 'done'
                ? t.autoTagInstallDone
                : phase === 'failed'
                  ? (autoTagProgress?.message ?? t.autoTagInstallFailed)
                  : (autoTagProgress?.message ?? t.autoTagInstalling)}
            </span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="muted">{progressPercent}%</span>
          </div>
        ) : null}

        <div className="wizard-actions between">
          {phase === 'progress' ? (
            <button type="button" onClick={handleSkipAutoTag} disabled={busy}>
              {t.skipForNow}
            </button>
          ) : (
            <button
              type="button"
              onClick={
                phase === 'done' || phase === 'failed'
                  ? handleProceedFromAutoTag
                  : handleSkipAutoTag
              }
              disabled={busy}
            >
              {phase === 'done' || phase === 'failed' ? t.next : t.skipForNow}
            </button>
          )}

          {alreadyReady ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                void handleEnableAutoTag().then(() => setStep('done'));
              }}
              disabled={busy}
            >
              <Sparkles size={15} />
              {t.autoTagEnable}
            </button>
          ) : phase === 'idle' ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleStartAutoTagInstall()}
              disabled={busy}
            >
              <Download size={15} />
              {t.autoTagInstallNow}
            </button>
          ) : phase === 'confirm' ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleConfirmAutoTagInstall()}
              disabled={busy}
            >
              <Download size={15} />
              {t.autoTagInstallStart}
            </button>
          ) : phase === 'done' || phase === 'failed' ? (
            <button
              type="button"
              className="primary-button"
              onClick={handleProceedFromAutoTag}
              disabled={busy}
            >
              <ArrowRight size={15} />
              {t.next}
            </button>
          ) : null}
        </div>
      </>
    );
  };

  const renderDone = () => {
    if (launchPhase === 'starting') {
      return (
        <>
          <div className="wizard-heading">
            <h1>{t.launchPreparing}</h1>
            <p>{t.launchPreparingBody}</p>
          </div>
          <div className="wizard-progress-card spinner">
            <span>{t.launchPreparing}</span>
          </div>
        </>
      );
    }

    if (launchPhase === 'ready') {
      return (
        <>
          <div className="wizard-heading">
            <h1>{t.launchedTitle}</h1>
            <p>{t.launchedBody}</p>
          </div>
          <div className="wizard-path-card">
            <strong>{launchedUrl}</strong>
          </div>
          <div className="wizard-actions between">
            <button type="button" onClick={() => void handleFinish()} disabled={busy}>
              {t.goToSettings}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenLaunchedUrl}
              disabled={busy}
            >
              <ExternalLink size={15} />
              {t.openInBrowser}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="wizard-heading">
          <h1>{t.doneTitle}</h1>
          <p>{t.doneBody}</p>
        </div>
        <div className="wizard-path-card">
          <strong>{t.selectedFolder}</strong>
          <span>{mode === 'existing' ? existingPath : targetPath}</span>
        </div>
        <div className="wizard-path-card warn">
          <strong>{t.launchNetworkNote}</strong>
        </div>
        <div className="wizard-actions between">
          <button type="button" onClick={() => void handleFinish()} disabled={busy}>
            {t.launchLater}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleLaunch()}
            disabled={busy}
          >
            <CheckCircle2 size={15} />
            {t.launchNow}
          </button>
        </div>
      </>
    );
  };

  return (
    <main className="wizard-shell">
      <section className="wizard-content">
        <div className="wizard-panel">
          <div className="wizard-step-indicator">
            <CaramelBoardLogo style={{ height: 27, width: 'auto' }} />
            <span>{t.stepLabel(currentStepIndex, totalSteps)}</span>
          </div>
          {step === 'intro' ? renderIntro() : null}
          {step === 'new-location' ? renderLocationBody(false) : null}
          {step === 'existing-location' ? renderExistingLocation() : null}
          {step === 'migrate-detect' ? renderMigrateDetect() : null}
          {step === 'migrate-location' ? renderLocationBody(true) : null}
          {step === 'migrate-confirm' ? renderMigrateConfirm() : null}
          {step === 'migrate-running' ? renderMigrateRunning() : null}
          {step === 'migrate-complete' ? renderMigrateComplete() : null}
          {step === 'sharing-setup' ? renderSharingSetup() : null}
          {step === 'ffmpeg-setup' ? renderFfmpegSetup() : null}
          {step === 'pdf-setup' ? renderPdfSetup() : null}
          {step === 'autotag-setup' ? renderAutoTagSetup() : null}
          {step === 'done' ? renderDone() : null}
        </div>
      </section>
      {error ? (
        <footer className="wizard-footer">
          <AlertCircle size={14} />
          <span className="wizard-message wizard-error">{error}</span>
        </footer>
      ) : null}
      {resetDataStoreConfirmOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <AlertCircle size={20} />
              <h2>{t.resetDataStoreTitle}</h2>
            </div>
            <div className="modal-copy">
              <p>{t.resetDataStoreBody}</p>
              <p>{targetPath}</p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setResetDataStoreConfirmOpen(false)}
                disabled={busy}
              >
                {t.resetDataStoreCancel}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setResetDataStoreConfirmOpen(false);
                  if (step === 'migrate-location') {
                    void handleClearMigrationTarget();
                    return;
                  }
                  void handleConfirmNew(true);
                }}
                disabled={busy}
              >
                {step === 'migrate-location' ? t.resetDataStoreContinue : t.resetDataStoreConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
