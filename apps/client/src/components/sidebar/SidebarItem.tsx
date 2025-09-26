import {cn} from '@/lib/utils';
import { CountBadge } from '@/components/ui/SideMenu/CountBadge';
import {Link} from '@tanstack/react-router';
import type {LucideIcon} from 'lucide-react';
import type {ComponentProps, ReactNode} from 'react';

interface BaseSidebarItemProps {
  icon?: LucideIcon;
  iconSize?: number;
  label: string;
  indent?: number;
  isActive?: boolean;
  children?: ReactNode;
  className?: string;
  count?: number;
}

interface LinkSidebarItemProps extends BaseSidebarItemProps {
  type?: 'link';
  to: ComponentProps<typeof Link>['to'];
  params?: ComponentProps<typeof Link>['params'];
  search?: ComponentProps<typeof Link>['search'];
  activeOptions?: ComponentProps<typeof Link>['activeOptions'];
}

interface ButtonSidebarItemProps extends BaseSidebarItemProps {
  type: 'button';
  onClick: () => void;
}

interface WrapperSidebarItemProps extends BaseSidebarItemProps {
  type: 'wrapper';
  children: ReactNode;
}

export type SidebarItemProps =
  | LinkSidebarItemProps
  | ButtonSidebarItemProps
  | WrapperSidebarItemProps;

export function SidebarItem(props: SidebarItemProps): React.ReactElement {
  const { icon: Icon, iconSize = 15, label, indent = 0, isActive, className, count } = props;

  const content = (
    <>
      {Icon && <Icon size={iconSize} />}
      <span className="mr-auto">{label}</span>
      <CountBadge count={count} />
    </>
  );

  const baseClassName = cn(
    'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 rounded hover:bg-gray-100 transition-colors',
    isActive && 'bg-gray-100 font-medium',
    className
  );

  const style = indent > 0 ? { paddingLeft: `${indent * 0.75 + 0.5}rem` } : undefined;

  if (props.type === 'button') {
    return (
      <button type="button" onClick={props.onClick} className={baseClassName} style={style}>
        {content}
      </button>
    );
  }

  if (props.type === 'wrapper') {
    return <>{props.children}</>;
  }

  // Default to link
  return (
    <Link
      to={props.to}
      params={props.params}
      search={props.search}
      className={baseClassName}
      style={style}
      activeProps={{ className: 'bg-gray-100 font-medium' }}
      activeOptions={props.activeOptions}
    >
      {content}
    </Link>
  );
}
