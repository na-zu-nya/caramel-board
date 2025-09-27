const HASH_PREFIX_LENGTH = 2;
const STORAGE_ROOT = 'library';

const padPage = (page: number) => String(page).padStart(3, '0');

const normalizeHash = (hash: string) => hash.toLowerCase();

const hashPrefix = (hash: string) => {
  const normalized = normalizeHash(hash);
  const prefix = normalized.slice(0, HASH_PREFIX_LENGTH);
  return prefix || '00';
};

const hashRemainder = (hash: string) => {
  const normalized = normalizeHash(hash);
  const remainder = normalized.slice(HASH_PREFIX_LENGTH);
  return remainder || normalized;
};

const sanitizeExtension = (ext: string) => ext.replace(/^\./, '').toLowerCase();

export const buildAssetKey = (dataSetId: number, hash: string, ext: string) => {
  const prefix = hashPrefix(hash);
  const extension = sanitizeExtension(ext);
  return `${STORAGE_ROOT}/${dataSetId}/assets/${prefix}/${normalizeHash(hash)}.${extension}`;
};

export const buildThumbnailKey = (dataSetId: number, hash: string) => {
  const prefix = hashPrefix(hash);
  const remainder = hashRemainder(hash);
  return `${STORAGE_ROOT}/${dataSetId}/thumbnails/${prefix}/${remainder}.jpg`;
};

interface PreviewOptions {
  page?: number;
  extension?: string;
}

export const buildPreviewKey = (dataSetId: number, hash: string, options?: PreviewOptions) => {
  const { page, extension = 'jpg' } = options ?? {};
  const prefix = hashPrefix(hash);
  const suffix = page === undefined ? '' : `.p${padPage(Math.max(0, page))}`;
  const ext = sanitizeExtension(extension);
  return `${STORAGE_ROOT}/${dataSetId}/preview/${prefix}/${normalizeHash(hash)}${suffix}.${ext}`;
};

export const splitHashForDirectory = (hash: string) => ({
  prefix: hashPrefix(hash),
  remainder: hashRemainder(hash),
});

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export const toPublicAssetPath = (value: string | null | undefined, dataSetId?: number): string => {
  if (!value) return '';
  if (isAbsoluteUrl(value)) return value;

  let normalized = value.startsWith('/') ? value.slice(1) : value;

  if (normalized.startsWith('files/')) {
    return `/${normalized}`;
  }

  if (normalized.startsWith(`${STORAGE_ROOT}/`)) {
    return `/files/${normalized}`;
  }

  if (normalized.startsWith('thumbnails/')) {
    const datasetSegment = dataSetId ? `${dataSetId}/` : '';
    normalized = `${STORAGE_ROOT}/${datasetSegment}${normalized}`;
    return `/files/${normalized}`;
  }

  if (/^\d+\//.test(normalized)) {
    normalized = `${STORAGE_ROOT}/${normalized}`;
    return `/files/${normalized}`;
  }

  return `/files/${normalized}`;
};

export const withPublicAssetPaths = <
  T extends {
    file?: string | null;
    thumbnail?: string | null;
    preview?: string | null;
  },
>(
  asset: T,
  dataSetId?: number
): T => {
  const base = {
    ...asset,
    file: toPublicAssetPath(asset.file, dataSetId),
    thumbnail: toPublicAssetPath(asset.thumbnail, dataSetId),
  } as T;

  if ('preview' in asset) {
    const preview = asset.preview ? toPublicAssetPath(asset.preview, dataSetId) : null;
    (base as T & { preview?: string | null }).preview = preview;
  }

  return base;
};

export const withPublicAssetArray = <T extends { file?: string | null; thumbnail?: string | null }>(
  assets: T[] | undefined,
  dataSetId?: number
): T[] => (assets ?? []).map((asset) => withPublicAssetPaths(asset, dataSetId));
