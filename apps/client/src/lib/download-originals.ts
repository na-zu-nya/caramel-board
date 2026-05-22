export const getStackOriginalsDownloadUrl = (
  datasetId: string | number,
  stackIds: Array<string | number>
) => {
  const params = new URLSearchParams();
  params.set('dataSetId', String(datasetId));
  for (const stackId of stackIds) {
    params.append('stackIds', String(stackId));
  }
  return `/api/v1/stacks/download-originals?${params.toString()}`;
};

export const getAssetOriginalsDownloadUrl = (
  datasetId: string | number,
  assetIds: Array<string | number>
) => {
  const params = new URLSearchParams();
  params.set('dataSetId', String(datasetId));
  for (const assetId of assetIds) {
    params.append('assetIds', String(assetId));
  }
  return `/api/v1/stacks/download-originals?${params.toString()}`;
};

export const downloadStackOriginals = (
  datasetId: string | number,
  stackIds: Array<string | number>
) => {
  if (stackIds.length === 0) return;

  const link = document.createElement('a');
  link.href = getStackOriginalsDownloadUrl(datasetId, stackIds);
  link.download = '';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadAssetOriginals = (
  datasetId: string | number,
  assetIds: Array<string | number>
) => {
  if (assetIds.length === 0) return;

  const link = document.createElement('a');
  link.href = getAssetOriginalsDownloadUrl(datasetId, assetIds);
  link.download = '';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};
