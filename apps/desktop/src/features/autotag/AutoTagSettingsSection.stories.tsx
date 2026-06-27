import type { AppSettings, AutoTagStatus } from '../../app/types';
import { type AutoTagSettingsCopy, AutoTagSettingsSection } from './AutoTagSettingsSection';

const copy: AutoTagSettingsCopy = {
  title: '自動タグ',
  description:
    '自動タグを使うと、取り込んだ画像に自動でタグを付け、画像ベースの検索に活用できます。',
  enable: '自動タグを使う',
  useGpu: 'GPUでタグを生成する',
  gpuAvailable: 'NVIDIA GPUを検出しました。',
  gpuUnavailable: '利用できるNVIDIA GPUは検出されませんでした。',
  threshold: 'タグの出やすさ',
  thresholdLess: '厳選',
  thresholdMore: '多め',
  installCompleted: '自動タグのインストールが完了しました。',
  installInProgress: '自動タグをインストールしています...',
  check: '状態を確認',
  prepare: 'モデルをインストール',
  advancedSettings: '詳細設定',
  advancedDescription: '通常は変更不要です。',
  codeFolder: '自動タグのコード保存先',
  modelFolder: '自動タグのモデル保存先',
  chooseCodeFolder: '自動タグのコード保存先を選択',
  chooseModelFolder: '自動タグのモデル保存先を選択',
  port: '自動タグポート',
  progress: {
    starting: '自動タグのインストールを開始しています...',
    repository: '自動タグのコードを準備しています...',
    model: 'モデルをダウンロードしています...',
    environment: '自動タグの実行環境を準備しています...',
    completed: '自動タグのインストールが完了しました。',
    failed: '自動タグのインストールに失敗しました。',
    fallback: '自動タグをインストールしています...',
  },
};

const settings: AppSettings = {
  dbPath: 'C:\\Users\\me\\AppData\\Roaming\\Caramel Board\\caramel-board.sqlite',
  libraryPath: 'C:\\Users\\me\\Pictures\\Caramel Board',
  setupCompleted: true,
  language: 'ja',
  port: 6777,
  allowExternalNetwork: false,
  basicAuthEnabled: false,
  basicAuthUsername: '',
  basicAuthPassword: '',
  autoTagEnabled: true,
  autoTagUseGpu: true,
  autoTagPort: 5001,
  autoTagRepoDir: 'C:\\Users\\me\\AppData\\Roaming\\Caramel Board\\autotag\\joytag',
  autoTagModelDir: 'C:\\Users\\me\\AppData\\Roaming\\Caramel Board\\autotag\\models',
  autoTagThreshold: 0.4,
  ffmpegPath: '',
  pdfRasterizerPath: '',
  launchOnStartup: false,
  residentMode: 'tray',
};

const status: AutoTagStatus = {
  enabled: true,
  running: false,
  starting: false,
  reachable: false,
  url: 'http://127.0.0.1:5001',
  logPath: 'C:\\Users\\me\\AppData\\Roaming\\Caramel Board\\autotag\\autotag-service.log',
  uvInstalled: true,
  repositoryReady: true,
  modelReady: true,
  ready: true,
  gpuAvailable: true,
  gpuPreferenceSupported: true,
  runtimeMode: 'cuda',
  message: '自動タグを利用できます。',
};

const handlers = {
  onBooleanSettingChange: () => {},
  onTextSettingChange: () => {},
  onThresholdChange: () => {},
  onRefreshStatus: () => {},
  onOpenInstallDialog: () => {},
  onChooseCodeFolder: () => {},
  onChooseModelFolder: () => {},
  onPortChange: () => {},
};

export default {
  title: 'Desktop/AutoTagSettingsSection',
  component: AutoTagSettingsSection,
};

export const GpuAvailable = {
  args: {
    settings,
    status,
    installProgress: null,
    copy,
    disabled: false,
    busy: false,
    statusClass: 'migration-status ready',
    statusTitle: '自動タグを利用できます',
    statusDescription: 'Caramel Board と一緒に起動できます。',
    ...handlers,
  },
};

export const GpuUnavailable = {
  args: {
    settings,
    status: {
      ...status,
      gpuAvailable: false,
      runtimeMode: 'cpu',
    },
    installProgress: null,
    copy,
    disabled: false,
    busy: false,
    statusClass: 'migration-status ready',
    statusTitle: '自動タグを利用できます',
    statusDescription: 'Caramel Board と一緒に起動できます。',
    ...handlers,
  },
};
