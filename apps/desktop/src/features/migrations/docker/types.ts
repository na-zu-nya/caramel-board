export interface DockerMigrationCopy {
  title: string;
  description: string;
  readyTitle: string;
  waitingTitle: string;
  notFoundTitle: string;
  waitingDescription: string;
  notFoundDescription: string;
  readyDescription: (datasetCount: number, stackCount: number, assetCount: number) => string;
  storageLocation: string;
  storageRoot: string;
  chooseStorageRoot: string;
  detect: string;
  migrate: string;
  inProgress: string;
  advancedSettings: string;
  advancedDescription: string;
  postgresDatabaseUrl: string;
  datasetId: string;
  optional: string;
  verifyFileReferences: string;
}
