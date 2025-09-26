import { cn } from '@/lib/utils';
import { selectionModeAtom } from '@/stores/ui';
import { useAtom } from 'jotai';
import { useSidebarDrop } from '@/hooks/useSidebarDrop';
import { SidebarItem, type SidebarItemProps } from './SidebarItem';

interface DroppableSidebarItemProps {
  onDrop?: (stackIds: number[]) => Promise<void>;
  acceptDrop?: boolean;
}

type CombinedProps = DroppableSidebarItemProps & SidebarItemProps;

export function DroppableSidebarItem({ onDrop, acceptDrop = true, ...props }: CombinedProps) {
  const [selectionMode] = useAtom(selectionModeAtom);
  const { containerProps, showDropIndicator } = useSidebarDrop({ acceptDrop, onDrop });

  // Radix ContextMenuTrigger(asChild) から渡されるイベント/属性を外側のdivへ伝播させるため、
  // SidebarItem用プロップとラッパー用プロップを分離する
  const {
    // SidebarItemProps
    type: itemType,
    to,
    params,
    search,
    activeOptions,
    onClick,
    icon,
    iconSize,
    label,
    indent,
    isActive,
    children,
    className,
    // その他はTrigger用（onContextMenu等）として外側divへ渡す
    ...triggerProps
  } = props as any;

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
        // 再構築した SidebarItemProps を渡す
        {...({
          type: itemType,
          to,
          params,
          search,
          activeOptions,
          onClick,
          icon,
          iconSize,
          label,
          count: (props as any).count,
          indent,
          isActive,
          children,
        } as SidebarItemProps)}
        className={cn(className, showDropIndicator && 'bg-transparent')}
      />
    </div>
  );
}
