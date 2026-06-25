import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface SideMenuProps {
  open?: boolean;
  title?: ReactNode;
  onClose?: () => void;
  className?: string;
  headerExtra?: ReactNode;
  children?: ReactNode;
  supportLeft?: ReactNode;
  supportRight?: ReactNode;
}

export function SideMenu({
  open = true,
  title,
  onClose,
  className,
  headerExtra,
  children,
  supportLeft,
  supportRight,
}: SideMenuProps) {
  const t = useT();
  const resolvedTitle = title ?? t.common.menu;

  return (
    <>
      {open && onClose && (
        <button
          type="button"
          className="sidebar-floating-backdrop"
          aria-label={t.sidebar.closeSidebar}
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'app-side-menu fixed top-0 left-0 h-full w-80 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          className
        )}
      >
        <div className="flex flex-col gap-1 p-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {typeof resolvedTitle === 'string' ? (
              <h2 className="text-lg font-semibold text-gray-900">{resolvedTitle}</h2>
            ) : (
              <div className="flex items-center text-gray-900">{resolvedTitle}</div>
            )}
            <div className="flex items-center gap-2">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                aria-label={t.sidebar.closeSidebar}
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
          </div>
          {(supportLeft || supportRight) && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div className="flex items-center gap-2">{supportLeft}</div>
              <div className="flex items-center gap-3">{supportRight}</div>
            </div>
          )}
        </div>
        <div className="app-side-menu-content p-2 space-y-3 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
