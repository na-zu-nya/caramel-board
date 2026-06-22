import type { Asset } from '@/types';

const VIDEO_EXT_PATTERN = /\.(mp4|mov|webm|m4v|avi|mkv)(?:[?#].*)?$/i;
const SVG_EXT_PATTERN = /\.svgz?(?:[?#].*)?$/i;

const normalizeMimeType = (mimeType?: string) => mimeType?.split(';')[0]?.trim().toLowerCase();

const normalizeFileType = (fileType?: string) => fileType?.trim().replace(/^\./, '').toLowerCase();

const hasSvgExtension = (source?: string | null) => Boolean(source && SVG_EXT_PATTERN.test(source));

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

export const getImageDisplaySource = (asset?: Asset | null): string => {
  if (!asset) return '';
  if (isSvgAsset(asset))
    return asset.preview || asset.thumbnail || asset.thumbnailUrl || asset.file || asset.url || '';
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
