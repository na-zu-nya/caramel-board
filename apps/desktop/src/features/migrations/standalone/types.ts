export interface StandaloneMigrationItem {
  id: string;
  title: string;
  checksum: string;
}

export interface StandaloneMigrationStatus {
  status: 'ready' | 'pending' | 'history_mismatch';
  dbPath: string;
  currentVersion: string | null;
  latestVersion: string | null;
  appliedCount: number;
  pending: StandaloneMigrationItem[];
  legacyBaseline: boolean;
  requiresBackup: boolean;
  backupPath: string | null;
  message: string;
  error: string | null;
}

export interface StandaloneMigrationProgress {
  running: boolean;
  completed: boolean;
  phase: string;
  message: string;
  percent: number;
  lastLog: string;
  dbPath: string | null;
  backupPath: string | null;
  error: string | null;
}

export interface StandaloneMigrationCopy {
  title: string;
  description: string;
  readyTitle: string;
  pendingTitle: string;
  errorTitle: string;
  readyDescription: string;
  pendingDescription: (count: number) => string;
  errorDescription: string;
  check: string;
  apply: string;
  modalTitle: string;
  modalBody: string;
  backupNotice: string;
  pendingList: string;
  currentVersion: string;
  latestVersion: string;
  inProgress: string;
  completedTitle: string;
  cancel: string;
  close: string;
  ok: string;
}
