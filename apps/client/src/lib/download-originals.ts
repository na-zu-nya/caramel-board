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
