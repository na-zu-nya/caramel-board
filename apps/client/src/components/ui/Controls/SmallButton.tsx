import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface SmallButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: 'default' | 'outline' | 'destructive' | 'ghost' | 'secondary';
}

export function SmallButton({
  className,
  variant = 'default',
  children,
  ...rest
}: SmallButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-md text-xs h-7 px-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none';
  const variants =
    variant === 'outline'
      ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
      : variant === 'destructive'
        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        : variant === 'ghost'
          ? 'hover:bg-accent hover:text-accent-foreground'
          : variant === 'secondary'
            ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            : 'bg-primary text-primary-foreground hover:bg-primary/90';
  return (
    <button type="button" className={cn(base, variants, className)} {...rest}>
      {children}
    </button>
  );
}
