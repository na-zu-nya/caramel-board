import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SideMenuProps {
  open?: boolean;
  title?: ReactNode;
  onClose?: () => void;
  className?: string;
  headerExtra?: ReactNode;
  children?: ReactNode;
}

export function SideMenu({
  open = true,
  title = 'Menu',
  onClose,
  className,
  headerExtra,
  children,
}: SideMenuProps) {
  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full w-80 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        className
      )}
    >
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close sidebar"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>
      </div>
      <div className="p-2 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 64px)' }}>
        {children}
      </div>
    </aside>
  );
}
