import * as LucideIcons from 'lucide-react';
import { Pin, PinOff } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AvailableIcon } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

interface OverviewContextMenuProps {
  children: React.ReactNode;
  datasetId: string;
  isPinned: boolean;
  onPin: (iconName: string, name: string) => void;
  onUnpin: () => void;
}

export function OverviewContextMenu({
  children,
  datasetId,
  isPinned,
  onPin,
  onUnpin,
}: OverviewContextMenuProps) {
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinName, setPinName] = useState('Overview');
  const [selectedIcon, setSelectedIcon] = useState<AvailableIcon>('Home');

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string, size = 16) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent size={size} />;
    }
    return <LucideIcons.Home size={size} />;
  };

  const handlePin = () => {
    if (!pinName.trim()) return;
    onPin(selectedIcon, pinName.trim());
    setShowPinDialog(false);
  };

  const handleUnpin = () => {
    onUnpin();
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {isPinned ? (
            <ContextMenuItem onClick={handleUnpin}>
              <PinOff className="w-4 h-4 mr-2" />
              Unpin from Header
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => setShowPinDialog(true)}>
              <Pin className="w-4 h-4 mr-2" />
              Pin to Header
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pin Overview to Header</DialogTitle>
            <DialogDescription>
              This will add a quick access link to the overview page in the header navigation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pin-name">Display Name</Label>
              <Input
                id="pin-name"
                type="text"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
                placeholder="Enter display name"
              />
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
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
              Cancel
            </Button>
            <Button type="button" onClick={handlePin} disabled={!pinName.trim()}>
              Pin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
