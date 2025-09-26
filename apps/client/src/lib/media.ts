import type { Asset } from '@/types';

const VIDEO_EXT_PATTERN = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;

/**
 * アセットが動画かどうかを判定するユーティリティ。
 * mimeType が含まれていればそれを優先し、無い場合は拡張子から推定します。
 */
export const isVideoAsset = (asset?: Asset | null): boolean => {
  if (!asset) return false;
  if (asset.preview) return true;
  const { mimeType, file, url } = asset;
  if (mimeType) {
    if (mimeType.startsWith('video/')) return true;
    if (mimeType.startsWith('image/')) return false;
  }
  const source = asset.preview || file || url;
  if (!source) return false;
  return VIDEO_EXT_PATTERN.test(source);
};
