import type { Asset } from '@/types';

const VIDEO_EXT_PATTERN = /\.(mp4|mov|webm|m4v|avi|mkv)(?:[?#].*)?$/i;
const SVG_EXT_PATTERN = /\.svgz?(?:[?#].*)?$/i;
const RAW_EXT_PATTERN = /\.(3fr|arw|cr2|cr3|dng|erf|nef|nrw|orf|pef|raf|rw2|sr2|srf)(?:[?#].*)?$/i;
const CONTENT_ADDRESSED_ASSET_PATH_PATTERN =
  /^\/files\/library\/\d+\/(?:assets|originals)\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]+$/i;
const RAW_MIME_TYPES = new Set([
  'image/x-adobe-dng',
  'image/x-canon-cr2',
  'image/x-canon-cr3',
  'image/x-nikon-nef',
  'image/x-olympus-orf',
  'image/x-panasonic-rw2',
  'image/x-pentax-pef',
  'image/x-sony-arw',
]);

const normalizeMimeType = (mimeType?: string) => mimeType?.split(';')[0]?.trim().toLowerCase();

const normalizeFileType = (fileType?: string) => fileType?.trim().replace(/^\./, '').toLowerCase();

const hasSvgExtension = (source?: string | null) => Boolean(source && SVG_EXT_PATTERN.test(source));
const hasRawExtension = (source?: string | null) => Boolean(source && RAW_EXT_PATTERN.test(source));

const getSourcePathname = (source: string): string => {
  try {
    return new URL(source, 'http://caramelboard.local').pathname;
  } catch {
    const q = source.indexOf('?');
    const h = source.indexOf('#');
    const cuts = [q, h].filter((idx) => idx >= 0);
    return cuts.length === 0 ? source : source.slice(0, Math.min(...cuts));
  }
};

export const isContentAddressedAssetSource = (source?: string | null): boolean => {
  if (!source || /^(data|blob):/i.test(source)) return false;
  return CONTENT_ADDRESSED_ASSET_PATH_PATTERN.test(getSourcePathname(source));
};

export const isSvgAsset = (asset?: Asset | null): boolean => {
  if (!asset) return false;

  if (normalizeMimeType(asset.mimeType) === 'image/svg+xml') return true;
  if (normalizeMimeType(asset.fileType) === 'image/svg+xml') return true;

  const fileType = normalizeFileType(asset.fileType);
  if (fileType === 'svg' || fileType === 'svgz') return true;

  return (
    hasSvgExtension(asset.originalName) || hasSvgExtension(asset.file) || hasSvgExtension(asset.url)
  );
};

export const isRawAsset = (asset?: Asset | null): boolean => {
  if (!asset) return false;

  const mimeType = normalizeMimeType(asset.mimeType);
  if (mimeType && RAW_MIME_TYPES.has(mimeType)) return true;

  const fileType = normalizeFileType(asset.fileType);
  if (fileType && RAW_EXT_PATTERN.test(`.${fileType}`)) return true;

  return (
    hasRawExtension(asset.originalName) || hasRawExtension(asset.file) || hasRawExtension(asset.url)
  );
};

export const getImageDisplaySource = (asset?: Asset | null): string => {
  if (!asset) return '';
  if (isSvgAsset(asset))
    return asset.preview || asset.thumbnail || asset.thumbnailUrl || asset.file || asset.url || '';
  if (isRawAsset(asset)) return asset.preview || asset.thumbnail || asset.thumbnailUrl || '';
  return asset.file || asset.url || '';
};

/**
 * アセットが動画かどうかを判定するユーティリティ。
 * mimeType が含まれていればそれを優先し、無い場合は拡張子から推定します。
 */
export const isVideoAsset = (asset?: Asset | null): boolean => {
  if (!asset) return false;
  if (asset.preview && VIDEO_EXT_PATTERN.test(asset.preview)) return true;
  const { mimeType, file, url } = asset;
  if (mimeType) {
    if (mimeType.startsWith('video/')) return true;
    if (mimeType.startsWith('image/')) return false;
  }
  const source = asset.preview || file || url;
  if (!source) return false;
  return VIDEO_EXT_PATTERN.test(source);
};
