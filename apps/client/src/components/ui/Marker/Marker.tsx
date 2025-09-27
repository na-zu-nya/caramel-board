import * as React from 'react';
import { cn } from '@/lib/utils';

export type MarkerColorKey =
  | 'light-gray'
  | 'bright-red'
  | 'bright-orange'
  | 'bright-yellow'
  | 'bright-green'
  | 'bright-cyan'
  | 'bright-blue'
  | 'bright-violet'
  // Legacy keys kept for compatibility
  | 'sakura'
  | 'pink'
  | 'hard-pink'
  | 'skyblue';

export interface MarkerProps extends React.SVGAttributes<SVGElement> {
  /** Accepts palette key or #hex. Defaults to 'hard-pink'. */
  color?: MarkerColorKey | string;
  /** Height in px. Width scales with the icon ratio. Default: 12 */
  size?: number;
  className?: string;
}

const clamp = (n: number, min = 0, max = 255) => Math.max(min, Math.min(max, n));
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = hex.trim().replace(/^#/, '');
  const s =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m;
  if (!/^([0-9a-fA-F]{6})$/.test(s)) return null;
  const num = parseInt(s, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
};
const rgbToHex = (r: number, g: number, b: number) =>
  `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b)
    .toString(16)
    .padStart(2, '0')}`;
const darkenHex = (hex: string, percent: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const factor = Math.max(0, 1 - percent);
  return rgbToHex(
    Math.round(rgb.r * factor),
    Math.round(rgb.g * factor),
    Math.round(rgb.b * factor)
  );
};

const mapColor = (key?: string): string => {
  if (!key) return '#EE0874';
  if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(key)) return key;
  switch (key) {
    case 'light-gray':
      return '#E5E7EB';
    case 'bright-red':
      return '#EF4444';
    case 'bright-orange':
      return '#F97316';
    case 'bright-yellow':
      return '#EAB308';
    case 'bright-green':
      return '#22C55E';
    case 'bright-cyan':
      return '#06B6D4';
    case 'bright-blue':
      return '#3B82F6';
    case 'bright-violet':
      return '#8B5CF6';
    case 'sakura':
      return '#E2BACF';
    case 'pink':
      return '#E259A2';
    case 'hard-pink':
      return '#EE0874';
    case 'skyblue':
      return '#55D7ED';
    default:
      return '#EE0874';
  }
};

/**
 * Pure presentational marker icon used in seekbars and timelines.
 * No external spacing; animations are controlled by parent via className.
 */
export const Marker = React.memo(function Marker({
  color = 'hard-pink',
  size = 12,
  className,
  ...rest
}: MarkerProps) {
  const fill = mapColor(color);
  const stroke = darkenHex(fill, 0.4);
  // Keep original aspect ratio (width:height = 10:12 for the 12x14 viewBox drawing)
  const width = Math.round((size * 10) / 12);
  const height = size;

  return (
    <svg
      viewBox="0 0 12 14"
      width={width}
      height={height}
      aria-hidden="true"
      className={cn(className)}
      {...rest}
    >
      <path
        d="M6 0 L10.5 5.5 C10.8 5.8 11 6.2 11 6.6 V12.1 C11 12.6 10.6 13 10.1 13 H1.9 C1.4 13 1 12.6 1 12.1 V6.6 C1 6.2 1.2 5.8 1.5 5.5 L6 0 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
});

export default Marker;
