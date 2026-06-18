import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Pin, PinOff } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AvailableIcon } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

interface OverviewContextMenuProps {
  children: React.ReactNode;
  isPinned: boolean;
  onPin: (iconName: string) => void;
  onUnpin: () => void;
}

export function OverviewContextMenu({
  children,
  isPinned,
  onPin,
  onUnpin,
}: OverviewContextMenuProps) {
  const t = useT();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<AvailableIcon>('Home');

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string, size = 16) => {
    /* biome-ignore lint/performance/noDynamicNamespaceImportAccess: dynamic icon lookup for configurable icons */
    const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as
      | LucideIcon
      | undefined;
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
    return <LucideIcons.Home size={size} />;
  };

  const handlePin = useCallback(() => {
    onPin(selectedIcon);
    setShowPinDialog(false);
  }, [onPin, selectedIcon]);

  const handleUnpin = useCallback(() => {
    onUnpin();
  }, [onUnpin]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {isPinned ? (
            <ContextMenuItem onClick={handleUnpin}>
              <PinOff className="w-4 h-4 mr-2" />
              {t.contextMenu.unpinFromHeader}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => setShowPinDialog(true)}>
              <Pin className="w-4 h-4 mr-2" />
              {t.contextMenu.pinToHeader}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.contextMenu.pinOverviewTitle}</DialogTitle>
            <DialogDescription>{t.contextMenu.pinOverviewDesc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.pins.name}</Label>
              <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                {t.pins.overview}
              </div>
              <p className="text-sm text-muted-foreground">{t.pins.nameFixed}</p>
            </div>

            <div className="space-y-2">
              <Label>{t.contextMenu.icon}</Label>
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {AVAILABLE_ICONS.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedIcon(iconName)}
                    className={cn(
                      'p-2 rounded-md border transition-colors',
                      selectedIcon === iconName
                        ? 'border-primary bg-primary/10'
                        : 'border-input hover:bg-accent hover:text-accent-foreground'
                    )}
                    title={iconName}
                  >
                    {renderIcon(iconName, 16)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPinDialog(false)}>
              {t.common.cancel}
            </Button>
            <Button type="button" onClick={handlePin}>
              {t.contextMenu.pin}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
