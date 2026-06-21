import { useCallback, useMemo } from 'react';
import type { AutoTagInstallCopy } from '../../features/autotag/AutoTagInstallDialog';
import type { AutoTagSettingsCopy } from '../../features/autotag/AutoTagSettingsSection';
import type { AutoTagProgressCopy } from '../../features/autotag/progressText';
import type { DockerMigrationCopy } from '../../features/migrations/docker/types';
import type { StandaloneMigrationCopy } from '../../features/migrations/standalone/types';
import type { GeneralSettingsCopy } from '../../features/settings/GeneralSettingsSection';
import type { translations } from '../translations';
import type { AppLanguage } from '../types';

type AppTranslation = (typeof translations)[AppLanguage];

export function useAppCopy(t: AppTranslation) {
  const showAutoTagCudaNote = useMemo(() => !navigator.platform.toLowerCase().includes('mac'), []);
  const autoTagInstallIntroDetail = useMemo(
    () =>
      showAutoTagCudaNote
        ? `${t.autoTagInstallIntroDetail} ${t.autoTagCudaNote}`
        : t.autoTagInstallIntroDetail,
    [showAutoTagCudaNote, t]
  );
  const autoTagDownloadConfirm = useCallback(
    (size: string) =>
      showAutoTagCudaNote
        ? `${t.autoTagDownloadConfirm(size)} ${t.autoTagCudaNote}`
        : t.autoTagDownloadConfirm(size),
    [showAutoTagCudaNote, t]
  );

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

  const autoTagProgressCopy = useMemo<AutoTagProgressCopy>(
    () => ({
      starting: t.autoTagInstallStarting,
      repository: t.autoTagInstallRepository,
      model: t.autoTagInstallModel,
      environment: t.autoTagInstallEnvironment,
      completed: t.autoTagInstallCompleted,
      failed: t.autoTagInstallFailed,
      fallback: t.autoTagInstallInProgress,
    }),
    [t]
  );

  const autoTagInstallCopy = useMemo<AutoTagInstallCopy>(
    () => ({
      introTitle: t.autoTagInstallIntroTitle,
      introLead: t.autoTagInstallIntroLead,
      introDetail: autoTagInstallIntroDetail,
      introLocal: t.autoTagInstallIntroLocal,
      introTraining: t.autoTagInstallIntroTraining,
      reference: t.autoTagInstallReference,
      metadataLoading: t.autoTagMetadataLoading,
      downloadConfirmTitle: t.autoTagDownloadConfirmTitle,
      downloadConfirm: autoTagDownloadConfirm,
      inProgress: t.autoTagInstallInProgress,
      backgroundContinue: t.autoTagBackgroundContinue,
      continue: t.continue,
      cancel: t.cancel,
      close: t.close,
      progress: autoTagProgressCopy,
    }),
    [autoTagDownloadConfirm, autoTagInstallIntroDetail, autoTagProgressCopy, t]
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
      progress: autoTagProgressCopy,
    }),
    [autoTagProgressCopy, t]
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

  return {
    generalSettingsCopy,
    standaloneMigrationCopy,
    autoTagInstallCopy,
    autoTagSettingsCopy,
    dockerMigrationCopy,
  };
}
