import type { LucideIcon } from 'lucide-react';

export interface AppSettings {
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

export interface SidecarStatus {
  running: boolean;
  url: string;
  pid: number | null;
  startedAt: number | null;
}

export interface DockerMigrationProgress {
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

export interface DockerDatasetSummary {
  id: number;
  name: string;
}

export interface DockerSourceDetection {
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

export interface AutoTagStatus {
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

export interface AutoTagInstallMetadata {
  modelName: string;
  modelUrl: string;
  downloadBytes: number;
  downloadSize: string;
}

export interface AutoTagInstallProgress {
  running: boolean;
  completed: boolean;
  phase: string;
  message: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  error: string | null;
}

export interface FfmpegCandidate {
  path: string;
  label: string;
  source: string;
  valid: boolean;
  version: string;
  details: string;
}

export interface PdfRasterizerCandidate {
  path: string;
  label: string;
  source: string;
  valid: boolean;
  version: string;
  details: string;
}

export interface NavJumpItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export type AppLanguage = 'en' | 'ja';
export type ResidentMode = 'taskbar' | 'tray';
export type AutoTagInstallStep = 'intro' | 'metadata' | 'confirm' | 'progress' | null;
export type TextSettingKey =
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
export type BooleanSettingKey =
  | 'allowExternalNetwork'
  | 'basicAuthEnabled'
  | 'dockerVerifyFiles'
  | 'autoTagEnabled'
  | 'launchOnStartup';
