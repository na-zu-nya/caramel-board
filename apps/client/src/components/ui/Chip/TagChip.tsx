import { cn } from '@/lib/utils';
import { cloneElement, isValidElement } from 'react';
import type * as React from 'react';

export interface TagChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
  name: string;
  displayName?: string;
  count?: number;
  prefixHash?: boolean;
  color?: string; // optional custom background color (e.g. "#ff00aa" or CSS color)
}

function getReadableTextColor(bg: string): string {
  // Basic luminance heuristic; supports hex like #rrggbb or any valid css color where possible
  // For non-hex, default to white text to be safe.
  const m = bg.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return '#ffffff';
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Perceived luminance (YIQ)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#111111' : '#ffffff';
}

export function TagChip({
  asChild,
  name,
  displayName,
  count,
  prefixHash = true,
  color,
  className,
  children,
  ...rest
}: TagChipProps) {
  const label = `${prefixHash ? '#' : ''}${displayName || name}`;

  const usesCustomColor = !!color;
  const style: React.CSSProperties | undefined = usesCustomColor
    ? { backgroundColor: color!, color: getReadableTextColor(color!) }
    : undefined;

  const node = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity',
        usesCustomColor
          ? 'border border-transparent'
          : 'border border-transparent bg-primary text-primary-foreground',
        className
      )}
      style={style}
      {...rest}
    >
      {label}
      {typeof count === 'number' && (
        <span className={cn('ml-1.5', usesCustomColor ? 'opacity-90' : 'opacity-70')}>
          ({count})
        </span>
      )}
    </span>
  );

  if (asChild && children && isValidElement(children)) {
    return cloneElement(children as any, {
      className: cn((children as any).props?.className),
      children: node,
    });
  }
  return node;
}
