export const THUMBNAIL_BLUR_TARGET_CLASS = 'caramel-thumbnail-blur-target';

const THUMBNAIL_BLUR_ACTIVE_CLASS = 'caramel-thumbnail-blur-active';
const THUMBNAIL_BLUR_RADIUS_PROPERTY = '--caramel-thumbnail-blur-radius';
const DEFAULT_THUMBNAIL_BLUR_RADIUS = '10px';
const NUMBER_VALUE_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;
const CSS_LENGTH_VALUE_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|vh|vw|vmin|vmax)$/i;

export type ThumbnailBlurRadius = string | number | undefined;
export type ThumbnailBlurCommand = (radius?: ThumbnailBlurRadius) => string;

type CaramelConsoleCommandTarget = {
  blur?: ThumbnailBlurCommand;
};

declare global {
  interface Window {
    $?: CaramelConsoleCommandTarget;
  }
}

const normalizeNumericRadius = (value: number): string =>
  Number.isFinite(value) ? `${Math.max(0, value)}px` : DEFAULT_THUMBNAIL_BLUR_RADIUS;

export const normalizeThumbnailBlurRadius = (radius?: ThumbnailBlurRadius): string => {
  if (typeof radius === 'number') {
    return normalizeNumericRadius(radius);
  }

  if (typeof radius !== 'string') {
    return DEFAULT_THUMBNAIL_BLUR_RADIUS;
  }

  const trimmed = radius.trim();
  if (trimmed.length === 0) {
    return DEFAULT_THUMBNAIL_BLUR_RADIUS;
  }

  if (NUMBER_VALUE_PATTERN.test(trimmed)) {
    return normalizeNumericRadius(Number.parseFloat(trimmed));
  }

  if (!CSS_LENGTH_VALUE_PATTERN.test(trimmed)) {
    return DEFAULT_THUMBNAIL_BLUR_RADIUS;
  }

  return trimmed.startsWith('-') ? '0px' : trimmed;
};

export const applyThumbnailBlur = (documentRef: Document, radius?: ThumbnailBlurRadius): string => {
  const normalizedRadius = normalizeThumbnailBlurRadius(radius);

  documentRef.documentElement.style.setProperty(THUMBNAIL_BLUR_RADIUS_PROPERTY, normalizedRadius);
  documentRef.documentElement.classList.add(THUMBNAIL_BLUR_ACTIVE_CLASS);

  return normalizedRadius;
};

const isConsoleCommandTarget = (value: unknown): value is CaramelConsoleCommandTarget =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

export const installThumbnailBlurConsoleCommand = (windowRef: Window): void => {
  const blur: ThumbnailBlurCommand = (radius) => applyThumbnailBlur(windowRef.document, radius);
  const existingDollar = windowRef.$;

  if (isConsoleCommandTarget(existingDollar)) {
    existingDollar.blur = blur;
    return;
  }

  windowRef.$ = { blur };
};
