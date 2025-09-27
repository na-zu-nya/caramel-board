import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SideMenuLabelProps {
  label: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  className?: string;
}

export function SideMenuLabel({
  label,
  collapsed = false,
  onToggle,
  action,
  className,
}: SideMenuLabelProps) {
  return (
    <div className={cn('flex items-center justify-between mb-1', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 pl-1 text-xs font-medium text-gray-500 uppercase hover:text-gray-700 transition-colors"
      >
        <span>{label}</span>
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      {action && <div className="flex gap-1">{action}</div>}
    </div>
  );
}
