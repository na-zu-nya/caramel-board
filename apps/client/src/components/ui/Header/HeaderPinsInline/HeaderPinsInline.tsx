import * as LucideIcons from 'lucide-react';
import { HeaderIconButton } from '../HeaderIconButton';
export interface NavPin { id: number | string; name: string; icon: string; }

export interface HeaderPinsInlineProps {
  navigationPins: NavPin[];
  isActive?: (pin: NavPin) => boolean;
  onNavClick?: (pin: NavPin) => void;
}

export function HeaderPinsInline({ navigationPins, isActive, onNavClick }: HeaderPinsInlineProps) {
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent size={18} /> : <LucideIcons.Bookmark size={18} />;
  };

  return (
    <div className="flex items-center gap-4">
      {navigationPins.length > 0 && (
        <div className="flex items-center gap-2">
          {navigationPins.map((pin) => (
            <HeaderIconButton key={pin.id} onClick={() => onNavClick?.(pin)} title={pin.name} isActive={isActive?.(pin)}>
              {renderIcon(pin.icon)}
            </HeaderIconButton>
          ))}
        </div>
      )}
    </div>
  );
}
