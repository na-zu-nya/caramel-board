import path from 'node:path';
import sharp from 'sharp';

const IMAGE_EXTENSIONS = new Set([
  '3fr',
  'arw',
  'jpg',
  'png',
  'webp',
  'bmp',
  'cr2',
  'cr3',
  'dng',
  'erf',
  'avif',
  'heic',
  'heif',
  'nef',
  'nrw',
  'orf',
  'pef',
  'raf',
  'rw2',
  'sr2',
  'srf',
  'svg',
  'svgz',
  'tif',
  'tiff',
]);
const VIDEO_EXTENSIONS = new Set(['gif', 'mp4', 'mov', 'avi', 'mkv', 'webm']);

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'image/x-adobe-dng': 'dng',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
};

const SHARP_FORMAT_EXTENSIONS: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  tiff: 'tiff',
  avif: 'avif',
  heif: 'heif',
  svg: 'svg',
};

export const canonicalizeMediaExtension = (value: string) => {
  const normalized = value.trim().replace(/^\./, '').toLowerCase();
  return normalized === 'jpeg' ? 'jpg' : normalized;
};

export const isImageMediaExtension = (value: string) =>
  IMAGE_EXTENSIONS.has(canonicalizeMediaExtension(value));

export const isVideoMediaExtension = (value: string) =>
  VIDEO_EXTENSIONS.has(canonicalizeMediaExtension(value));

export const isSupportedMediaExtension = (value: string) =>
  isImageMediaExtension(value) || isVideoMediaExtension(value);

const extensionFromName = (value: string) => canonicalizeMediaExtension(path.extname(value));

const extensionFromMimeType = (mimeType: string | undefined) => {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase();
  return normalized ? (MIME_EXTENSIONS[normalized] ?? null) : null;
};

const detectImageExtension = async (sourcePath: string) => {
  try {
    const metadata = await sharp(sourcePath, {
      failOnError: false,
      sequentialRead: true,
    }).metadata();
    return metadata.format ? (SHARP_FORMAT_EXTENSIONS[metadata.format] ?? null) : null;
  } catch {
    return null;
  }
};

export async function resolveMediaExtension(input: {
  sourcePath: string;
  originalName: string;
  mimeType?: string;
}): Promise<string | null> {
  const namedCandidates = [
    extensionFromName(input.originalName),
    extensionFromName(input.sourcePath),
  ];
  const namedExtension = namedCandidates.find(isSupportedMediaExtension);
  if (namedExtension) return namedExtension;

  const detectedExtension = await detectImageExtension(input.sourcePath);
  if (detectedExtension && isSupportedMediaExtension(detectedExtension)) return detectedExtension;

  const mimeExtension = extensionFromMimeType(input.mimeType);
  return mimeExtension && isSupportedMediaExtension(mimeExtension) ? mimeExtension : null;
}

export function ensureMediaExtension(originalName: string, extension: string): string {
  const currentExtension = extensionFromName(originalName);
  if (isSupportedMediaExtension(currentExtension)) return originalName;

  const currentSuffix = path.extname(originalName);
  const baseName = currentSuffix ? path.basename(originalName, currentSuffix) : originalName;
  return `${baseName || 'asset'}.${canonicalizeMediaExtension(extension)}`;
}
