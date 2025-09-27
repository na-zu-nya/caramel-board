import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SideMenuLabel } from './SideMenuLabel';

export interface SideMenuGroupProps {
  label: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SideMenuGroup({
  label,
  collapsed,
  onToggle,
  action,
  children,
  className,
}: SideMenuGroupProps) {
  return (
    <div className={cn('pb-1', className)}>
      <SideMenuLabel label={label} collapsed={collapsed} onToggle={onToggle} action={action} />
      {!collapsed && children && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}
