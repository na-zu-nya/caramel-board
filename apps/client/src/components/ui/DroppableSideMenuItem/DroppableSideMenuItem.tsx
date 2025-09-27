import { useSidebarDrop } from '@/hooks/useSidebarDrop';
import { cn } from '@/lib/utils';
import { SideMenuListItem, type SideMenuListItemProps } from '../SideMenu';

export interface DroppableSideMenuItemProps extends Omit<SideMenuListItemProps, 'onDrop'> {
  acceptDrop?: boolean;
  onStacksDrop?: (stackIds: number[]) => Promise<void> | void;
}

export function DroppableSideMenuItem({
  acceptDrop = true,
  onStacksDrop,
  className,
  ...rest
}: DroppableSideMenuItemProps) {
  const { containerProps, showDropIndicator } = useSidebarDrop({
    acceptDrop,
    onDrop: onStacksDrop,
  });

  return (
    <div
      {...containerProps}
      className={cn(
        'relative transition-all duration-200',
        showDropIndicator && 'bg-blue-50 ring-2 ring-blue-400 ring-inset rounded'
      )}
    >
      <SideMenuListItem className={className} {...rest} />
    </div>
  );
}
