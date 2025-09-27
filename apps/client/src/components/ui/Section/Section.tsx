import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  containerClassName?: string;
  children?: ReactNode;
}

export function Section({ className, containerClassName, children, ...divProps }: SectionProps) {
  return (
    <section className={cn('space-y-4', className)} {...divProps}>
      <div className={cn(containerClassName)}>{children}</div>
    </section>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {action && <div className="text-sm ml-4">{action}</div>}
    </div>
  );
}

export interface SectionBlockProps {
  title: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

// Convenience wrapper: renders a header + content container
export function SectionBlock({ title, action, children, className }: SectionBlockProps) {
  return (
    <section className={cn('', className)}>
      <SectionHeader title={title} action={action} />
      {children}
    </section>
  );
}
