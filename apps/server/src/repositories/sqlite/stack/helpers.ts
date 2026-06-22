import type { DatabaseSync } from 'node:sqlite';
import type { DominantColor } from '../../../utils/colorExtractor';
import type { AutoTagEntry, StackDatasetRow, StackMediaType } from './types';

export const DEFAULT_AUTO_STOP_TAGS = [
  '1girl',
  '1boy',
  'solo',
  'rating:safe',
  'safe',
  'highres',
  'long_hair',
  'short_hair',
  'looking_at_viewer',
  'smile',
  'simple_background',
  'multiple_views',
];

export const SIMILAR_CONFIG = {
  autoTopN: 30,
  autoProbeCount: 8,
  autoMinScore: 0.55,
  manualTopN: 60,
  candidateLimit: 1500,
  resultLimit: 1000,
  autoWeight: 1.0,
  manualWeight: 1.2,
  manualWeightMultiplierOnIdf: 1.0,
  minIdf: 0.05,
};

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'avif',
  'heic',
  'heif',
  'svg',
  'svgz',
  'tif',
  'tiff',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);

export const toArray = (value: string | string[] | undefined) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

export const parseJsonArray = (value: string | null | undefined): unknown[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const placeholders = (values: unknown[]) => values.map(() => '?').join(', ');
export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const normalizeTag = (tag: string) => tag.trim().toLowerCase();

const normalizeExtension = (ext: string) => ext.replace(/^\./, '').toLowerCase();

export const canonicalizeExtension = (ext: string) => {
  const normalized = normalizeExtension(ext);
  return normalized === 'jpeg' ? 'jpg' : normalized;
};

export const isImageExtension = (ext: string) => IMAGE_EXTENSIONS.has(canonicalizeExtension(ext));
export const isVideoExtension = (ext: string) => VIDEO_EXTENSIONS.has(canonicalizeExtension(ext));
export const isImageFileType = (fileType: string) => {
  const normalized = fileType.trim().toLowerCase();
  return normalized.startsWith('image/') || isImageExtension(normalized);
};
export const isVideoFileType = (fileType: string) => {
  const normalized = fileType.trim().toLowerCase();
  return normalized.startsWith('video/') || isVideoExtension(normalized);
};

export const detectActualMediaTypeFromFileTypes = (
  fileTypes: Array<string | null | undefined>
): StackMediaType | null => {
  const normalized = fileTypes.filter((fileType): fileType is string => Boolean(fileType));
  if (normalized.length === 0) return null;
  if (normalized.some(isVideoFileType)) return 'video';

  const imageCount = normalized.filter(isImageFileType).length;
  if (imageCount === 1 && normalized.length === 1) return 'image';
  if (imageCount > 1 && imageCount === normalized.length) return 'multipleImages';
  return null;
};

export const toColorJson = (colors: DominantColor[] | null) =>
  colors && colors.length > 0 ? JSON.stringify(colors) : null;

export const toAutoTagEntry = (value: unknown): AutoTagEntry | null => {
  if (typeof value === 'string') return { tag: value };
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const tag = typeof record.tag === 'string' ? record.tag : '';
  if (!tag) return null;
  const rawScore = record.score;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : undefined;
  return { tag, score };
};

export const isDominantColor = (value: unknown): value is DominantColor => {
  if (!value || typeof value !== 'object') return false;
  const color = value as Partial<DominantColor>;
  return (
    typeof color.r === 'number' &&
    typeof color.g === 'number' &&
    typeof color.b === 'number' &&
    typeof color.hex === 'string' &&
    typeof color.percentage === 'number' &&
    typeof color.hue === 'number' &&
    typeof color.saturation === 'number' &&
    typeof color.lightness === 'number' &&
    typeof color.hueCategory === 'string'
  );
};

export const getStackDataset = (db: DatabaseSync, stackId: number) =>
  db.prepare('SELECT id, dataset_id FROM stacks WHERE id = ?').get(stackId) as
    | StackDatasetRow
    | undefined;
