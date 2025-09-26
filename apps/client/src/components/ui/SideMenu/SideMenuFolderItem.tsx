import { Folder, FolderOpen } from 'lucide-react';
import { SideMenuListItem, type SideMenuListItemProps } from './SideMenuListItem';

export interface SideMenuFolderItemProps extends Omit<SideMenuListItemProps, 'icon'> {
  open?: boolean;
}

export function SideMenuFolderItem({ open = false, ...rest }: SideMenuFolderItemProps) {
  return <SideMenuListItem icon={open ? FolderOpen : Folder} {...rest} />;
}

