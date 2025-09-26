import { cn } from '@/lib/utils';
import { cloneElement, isValidElement, createElement, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CountBadge } from './CountBadge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../context-menu';

export interface SideMenuListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  icon?: LucideIcon | ReactNode;
  iconSize?: number;
  label: string;
  indent?: number;
  active?: boolean;
  count?: number;
  right?: ReactNode;
  className?: string;
  // Context menu options
  enableContextMenu?: boolean;
  onOpen?: () => void;
  pinnable?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
}

export function SideMenuListItem({
  asChild,
  icon,
  iconSize = 15,
  label,
  indent = 0,
  active,
  count,
  right,
  className,
  children,
  enableContextMenu,
  onOpen,
  pinnable,
  pinned,
  onPin,
  onUnpin,
  ...props
}: SideMenuListItemProps) {
  const rootRef = useRef<HTMLElement | null>(null as any);
  const IconComp: any = icon;
  const style = indent > 0 ? { paddingLeft: `${indent * 0.75 + 0.5}rem` } : undefined;
  const baseClass = cn(
    'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 rounded hover:bg-gray-100 transition-colors',
    active && 'bg-gray-100 font-medium',
    className
  );

  const safeNode = (node: ReactNode) => (isValidElement(node) || typeof node === 'string' || typeof node === 'number' ? node : null);

  const renderIconNode = () => {
    if (!IconComp) return null;
    if (isValidElement(IconComp)) return IconComp;
    try {
      return createElement(IconComp as any, { size: iconSize });
    } catch {
      return null;
    }
  };

  const content = (
    <>
      {renderIconNode()}
      <span className="mr-auto">{label}</span>
      <CountBadge count={count} />
      {safeNode(right)}
    </>
  );

  const shouldWrapWithContext = enableContextMenu || onOpen || pinnable;

  const openAction = () => {
    if (onOpen) return onOpen();
    try {
      (rootRef.current as any)?.click?.();
    } catch {}
  };

  if (asChild && children && isValidElement(children)) {
    const child: any = children as any;
    const element = cloneElement(child, {
      ...props,
      ref: (node: any) => {
        const r: any = (child as any).ref;
        if (typeof r === 'function') r(node);
        else if (r && typeof r === 'object') r.current = node;
        (rootRef as any).current = node;
      },
      className: cn((child as any).props?.className, baseClass),
      style: { ...(((child as any).props?.style) || {}), ...style },
      children: content,
    });
    if (!shouldWrapWithContext) return element;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{element}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={openAction}>Open</ContextMenuItem>
          {pinnable && (
            <>
              <ContextMenuSeparator />
              {pinned ? (
                <ContextMenuItem onSelect={onUnpin}>Unpin</ContextMenuItem>
              ) : (
                <ContextMenuItem onSelect={onPin}>Pin</ContextMenuItem>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const button = (
    <button ref={rootRef as any} type="button" className={baseClass} style={style} {...props}>
      {content}
    </button>
  );

  if (!shouldWrapWithContext) return button;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={openAction}>Open</ContextMenuItem>
        {pinnable && (
          <>
            <ContextMenuSeparator />
            {pinned ? (
              <ContextMenuItem onSelect={onUnpin}>Unpin</ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={onPin}>Pin</ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
