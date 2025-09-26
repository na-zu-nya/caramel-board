import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SidebarGroupProps {
  label: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SidebarGroup({
  label,
  isCollapsed = false,
  onToggle,
  children,
  actions,
  className,
}: SidebarGroupProps) {
  return (
    <div className={cn('pb-1', className)}>
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 pl-1 text-xs font-medium text-gray-500 uppercase hover:text-gray-700 transition-colors"
        >
          <span>{label}</span>
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {actions && <div className="flex gap-1">{actions}</div>}
      </div>
      {!isCollapsed && children && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}
