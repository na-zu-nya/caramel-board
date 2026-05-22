import { getThumbnailPath } from '@/utils/thumbnailPath';

export const STACK_IDS_MIME = 'application/x-caramel-stack-ids';
const STACK_DRAG_LEGACY_PREFIX = 'stack-item:';
const STACKS_DRAG_LEGACY_PREFIX = 'stack-items:';
const STACK_DRAG_PREVIEW_SELECTOR = '[data-stack-drag-preview="true"]';

type ImageDragSource = {
  name?: unknown;
  title?: unknown;
  originalName?: unknown;
  file?: unknown;
  url?: unknown;
  preview?: unknown;
  thumbnail?: unknown;
  thumbnailUrl?: unknown;
  assets?: unknown;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function firstAsset(source: ImageDragSource): Record<string, unknown> | null {
  if (!Array.isArray(source.assets)) return null;
  for (const asset of source.assets) {
    if (isRecord(asset)) return asset;
  }
  return null;
}

function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const path = getThumbnailPath(value);
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).href;
}

function getExtension(url: string): string {
  try {
    const pathname = new URL(
      url,
      typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    ).pathname;
    return pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'jpg';
  } catch {
    return 'jpg';
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'image';
}

function safeSetData(dataTransfer: DataTransfer, type: string, value: string): void {
  try {
    dataTransfer.setData(type, value);
  } catch {}
}

export function getSourceImageUrl(
  source: ImageDragSource,
  fallback?: string | null
): string | null {
  const asset = firstAsset(source);
  const candidates = [
    asset ? getString(asset.file) : null,
    asset ? getString(asset.url) : null,
    asset ? getString(asset.preview) : null,
    getString(source.file),
    getString(source.url),
    getString(source.preview),
    getString(source.thumbnail),
    getString(source.thumbnailUrl),
    fallback,
  ];

  for (const candidate of candidates) {
    if (candidate) return normalizeUrl(candidate);
  }
  return null;
}

export function getSourceImageFilename(
  source: ImageDragSource,
  imageUrl: string,
  fallback = 'image'
): string {
  const asset = firstAsset(source);
  const rawName =
    (asset ? getString(asset.originalName) : null) ??
    getString(source.originalName) ??
    getString(source.title) ??
    getString(source.name) ??
    fallback;
  const filename = sanitizeFilename(rawName);
  return /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename}.${getExtension(imageUrl)}`;
}

export function setStackDragData(
  dataTransfer: DataTransfer,
  stackIds: Array<string | number>
): void {
  const ids = stackIds.map((id) => String(id)).filter((id) => id.length > 0);
  if (ids.length === 0) return;

  safeSetData(dataTransfer, STACK_IDS_MIME, ids.join(','));
  safeSetData(
    dataTransfer,
    'text/plain',
    ids.length === 1
      ? `${STACK_DRAG_LEGACY_PREFIX}${ids[0]}`
      : `${STACKS_DRAG_LEGACY_PREFIX}${ids.join(',')}`
  );
}

export function setExternalImageDragData(
  dataTransfer: DataTransfer,
  imageUrl: string | null,
  filename: string,
  options?: {
    includePlainText?: boolean;
  }
): void {
  if (!imageUrl) return;

  const extension = getExtension(imageUrl);
  const mime = MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
  if (options?.includePlainText) {
    safeSetData(dataTransfer, 'text/plain', imageUrl);
  }
  safeSetData(dataTransfer, 'text/uri-list', imageUrl);
  safeSetData(dataTransfer, 'text/x-moz-url', `${imageUrl}\n${filename}`);
  safeSetData(dataTransfer, 'DownloadURL', `${mime}:${filename}:${imageUrl}`);
}

export function hasStackDragDataTransfer(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.types ?? []).includes(STACK_IDS_MIME);
}

export function setNativeImageDragPreview(
  dataTransfer: DataTransfer,
  container: EventTarget | null
): void {
  if (!(container instanceof HTMLElement)) return;

  const previewElement =
    container.querySelector<HTMLElement>(STACK_DRAG_PREVIEW_SELECTOR) ?? container;
  const rect = previewElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  try {
    dataTransfer.setDragImage(previewElement, rect.width / 2, rect.height / 2);
  } catch {}
}

export function extractStackIdsFromDataTransfer(dataTransfer: DataTransfer): number[] {
  const typedIds = dataTransfer.getData(STACK_IDS_MIME);
  if (typedIds) {
    return typedIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  const text = dataTransfer.getData('text/plain');
  if (text.startsWith(STACKS_DRAG_LEGACY_PREFIX)) {
    return text
      .replace(STACKS_DRAG_LEGACY_PREFIX, '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  if (text.startsWith(STACK_DRAG_LEGACY_PREFIX)) {
    const id = Number(text.replace(STACK_DRAG_LEGACY_PREFIX, '').trim());
    return Number.isFinite(id) && id > 0 ? [id] : [];
  }

  const legacyId = Number(text);
  return Number.isFinite(legacyId) && legacyId > 0 ? [legacyId] : [];
}
