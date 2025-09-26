import * as LucideIcons from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../dropdown-menu';

export interface NavPin { id: number | string; name: string; icon: string; }

export interface HeaderPinsCompactProps {
  navigationPins: NavPin[];
  onNavClick?: (pin: NavPin) => void;
  isActive?: (pin: NavPin) => boolean;
}

export function HeaderPinsCompact({ navigationPins, onNavClick, isActive }: HeaderPinsCompactProps) {
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent size={18} /> : <LucideIcons.Bookmark size={18} />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
          <span>Pins</span>
          <ChevronDown size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[200px]">
        {navigationPins.map((pin) => (
          <DropdownMenuItem
            key={pin.id}
            onClick={() => onNavClick?.(pin)}
            className={isActive?.(pin) ? 'bg-gray-100' : undefined}
          >
            {renderIcon(pin.icon)}
            <span className="ml-2">{pin.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
