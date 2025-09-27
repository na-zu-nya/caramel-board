import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function Toolbar({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2', className)} {...rest} />;
}
