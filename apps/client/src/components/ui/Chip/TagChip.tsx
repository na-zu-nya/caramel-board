import type * as React from 'react';
import { cloneElement, isValidElement } from 'react';
import { cn } from '@/lib/utils';

export interface TagChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
  name: string;
  displayName?: string;
  count?: number;
  prefixHash?: boolean;
  color?: string; // optional custom background color (e.g. "#ff00aa" or CSS color)
  foregroundColor?: string; // optional text color override when using custom background
}

const FALLBACK_FOREGROUND = '#ffffff';

export function TagChip({
  asChild,
  name,
  displayName,
  count,
  prefixHash = true,
  color,
  foregroundColor,
  className,
  children,
  style: inlineStyle,
  ...rest
}: TagChipProps) {
  const label = `${prefixHash ? '#' : ''}${displayName || name}`;

  const usesCustomColor = !!color;
  const resolvedForegroundColor = usesCustomColor
    ? (foregroundColor ?? FALLBACK_FOREGROUND)
    : undefined;
  const style: React.CSSProperties | undefined = usesCustomColor
    ? { ...inlineStyle, backgroundColor: color!, color: resolvedForegroundColor }
    : inlineStyle;

  const node = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity',
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
    const childElement = children as React.ReactElement;
    return cloneElement(childElement, {
      className: cn(childElement.props?.className),
      children: node,
    });
  }
  return node;
}
