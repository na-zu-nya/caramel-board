import { cn } from '@/lib/utils';
import type { CSSProperties, ReactNode } from 'react';

export interface AppHeaderProps {
  withSidebar?: boolean;
  backgroundColor?: string;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Presentational "AppHeader" (デザイン専用)
 * - レイアウト: 左/中央/右の3領域スロット
 * - 状態やデータ取得のロジックは持たない
 */
export function AppHeader({
  withSidebar = false,
  backgroundColor,
  left,
  center,
  right,
  className,
  style,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-50 backdrop-blur supports-[backdrop-filter]:backdrop-blur text-white transition-all duration-300 ease-in-out',
        withSidebar ? 'left-80' : 'left-0',
        className
      )}
      style={{
        backgroundColor: backgroundColor ?? 'rgba(255,255,255,0.8)',
        ...style,
      }}
    >
      <div className="px-4 h-14 flex items-center relative">
        <div className="flex items-center gap-2">{left}</div>
        {center && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">{center}</div>
        )}
        <div className="flex items-center gap-2 ml-auto">{right}</div>
      </div>
    </header>
  );
}

export function AppHeaderDivider() {
  return <div className="w-px h-6 bg-white/20" />;
}
