import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SideMenuMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  variant?: 'muted' | 'info' | 'warn' | 'error';
}

export function SideMenuMessage({ variant = 'muted', className, ...p }: SideMenuMessageProps) {
  const color =
    variant === 'info'
      ? 'text-blue-500'
      : variant === 'warn'
        ? 'text-amber-600'
        : variant === 'error'
          ? 'text-red-600'
          : 'text-gray-400';
  return <p className={cn('px-2 py-1 text-xs', color, className)} {...p} />;
}
