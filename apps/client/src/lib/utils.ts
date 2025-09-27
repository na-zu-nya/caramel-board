import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert hex color to OKLCH color space
 * @param hex - Hex color string (e.g., "#ff0000")
 * @returns OKLCH color string (e.g., "oklch(0.628 0.258 29.234)")
 */
export function hexToOklch(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Convert hex to RGB (0-1 range)
  const r = Number.parseInt(hex.substring(0, 2), 16) / 255;
  const g = Number.parseInt(hex.substring(2, 4), 16) / 255;
  const b = Number.parseInt(hex.substring(4, 6), 16) / 255;

  // Convert RGB to linear RGB
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Convert to OKLab
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  const okl = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const oka = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  // Convert to OKLCH
  const C = Math.sqrt(oka * oka + okb * okb);
  let h = (Math.atan2(okb, oka) * 180) / Math.PI;
  if (h < 0) h += 360;

  // Clamp values to valid ranges
  const L = Math.max(0, Math.min(1, okl));
  const chroma = Math.max(0, C);
  const hue = h;

  return `oklch(${L.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(3)})`;
}

/**
 * Debug function to check CSS variables
 * Call this in browser console: window.debugThemeColors()
 */
export function debugThemeColors() {
  const root = document.documentElement;
  const variables = [
    '--primary',
    '--primary-foreground',
    '--color-primary',
    '--color-primary-foreground',
    '--ring',
    '--color-ring',
    '--sidebar-primary',
    '--color-sidebar-primary',
  ];

  const values: Record<string, string> = {};
  variables.forEach((variable) => {
    const value = getComputedStyle(root).getPropertyValue(variable);
    values[variable] = value || 'not set';
  });

  console.table(values);
  return values;
}

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).debugThemeColors = debugThemeColors;
  (window as any).hexToOklch = hexToOklch;
}

/**
 * Return hex string for copy without leading '#'. Uses uppercase for consistency.
 */
export function hexForCopy(hex: string): string {
  if (!hex) return '';
  const v = hex.trim().replace(/^#/, '');
  return v.toUpperCase();
}
