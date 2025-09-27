import { useAtom } from 'jotai';
import type { HTMLAttributes } from 'react';
import { useSidebarDrop } from '@/hooks/useSidebarDrop';
import { cn } from '@/lib/utils';
import { selectionModeAtom } from '@/stores/ui';
import { SidebarItem, type SidebarItemProps } from './SidebarItem';

interface DroppableSidebarItemProps {
  onDrop?: (stackIds: number[]) => Promise<void>;
  acceptDrop?: boolean;
}

type CombinedProps = DroppableSidebarItemProps & SidebarItemProps & HTMLAttributes<HTMLDivElement>;

export function DroppableSidebarItem({ onDrop, acceptDrop = true, ...props }: CombinedProps) {
  const [_selectionMode] = useAtom(selectionModeAtom);
  const { containerProps, showDropIndicator } = useSidebarDrop({ acceptDrop, onDrop });

  // Radix ContextMenuTrigger(asChild) から渡されるイベント/属性を外側のdivへ伝播させるため、
  // SidebarItem用プロップとラッパー用プロップを分離する
  const {
    type: itemType,
    to,
    params,
    search,
    activeOptions,
    onClick,
    icon,
    iconSize,
    label,
    count,
    indent,
    isActive,
    children,
    className,
    ...triggerProps
  } = props as SidebarItemProps & HTMLAttributes<HTMLDivElement>;

  return (
    <div
      {...containerProps}
      className={cn(
        'relative transition-all duration-200',
        showDropIndicator && 'bg-blue-50 ring-2 ring-blue-400 ring-inset rounded'
      )}
      {...(triggerProps as React.HTMLAttributes<HTMLDivElement>)}
    >
      <SidebarItem
        type={itemType}
        to={to}
        params={params}
        search={search}
        activeOptions={activeOptions}
        onClick={onClick}
        icon={icon}
        iconSize={iconSize}
        label={label}
        count={count}
        indent={indent}
        isActive={isActive}
        className={cn(className, showDropIndicator && 'bg-transparent')}
      >
        {children}
      </SidebarItem>
    </div>
  );
}
