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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getMediaTypeLabel, useT } from '@/lib/i18n';
import type { AvailableIcon, MediaCategory } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

interface MediaTypeContextMenuProps {
  children: React.ReactNode;
  mediaType: MediaCategory;
  datasetId: string;
  isPinned?: boolean;
  onPin?: (iconName: string) => void;
  onUnpin?: () => void;
}

const DEFAULT_MEDIA_TYPE_ICONS: Record<MediaCategory, AvailableIcon> = {
  image: 'Image',
  comic: 'BookOpen',
  video: 'Film',
};

export function MediaTypeContextMenu({
  children,
  mediaType,
  isPinned,
  onPin,
  onUnpin,
}: MediaTypeContextMenuProps) {
  const t = useT();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectedIcon, setSelectedIcon] = useState<AvailableIcon>(
    DEFAULT_MEDIA_TYPE_ICONS[mediaType]
  );

  const handlePin = useCallback(async () => {
    if (!onPin) return;

    setLoading(true);
    try {
      await onPin(selectedIcon);
      setShowPinDialog(false);
    } catch (error) {
      console.error('Pin creation error:', error);
    } finally {
      setLoading(false);
    }
  }, [onPin, selectedIcon]);

  const openPinDialog = useCallback(() => {
    setSelectedIcon(DEFAULT_MEDIA_TYPE_ICONS[mediaType]);
    setShowPinDialog(true);
  }, [mediaType]);

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string) => {
    /* biome-ignore lint/performance/noDynamicNamespaceImportAccess: dynamic icon lookup for media type pins */
    const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as
      | LucideIcon
      | undefined;
    if (IconComponent) {
      return <IconComponent size={16} />;
    }
    return <LucideIcons.Bookmark size={16} />; // Fallback icon
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-36">
          {isPinned ? (
            <ContextMenuItem onClick={onUnpin}>
              <PinOff className="w-4 h-4 mr-2" />
              {t.contextMenu.unpin}
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={openPinDialog}>
              <Pin className="w-4 h-4 mr-2" />
              {t.contextMenu.pin}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Pin Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {getMediaTypeLabel(t, mediaType)}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t.pins.editPinDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label className="text-gray-700">{t.pins.name}</Label>
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {getMediaTypeLabel(t, mediaType)}
              </div>
              <p className="text-sm text-gray-500">{t.pins.nameFixed}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">{t.pins.icon}</Label>
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                {AVAILABLE_ICONS.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-2 rounded-md border transition-colors ${
                      selectedIcon === iconName
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={iconName}
                  >
                    {renderIcon(iconName)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                {t.pins.current}: {selectedIcon}
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPinDialog(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t.common.cancel}
              </Button>
              <Button
                onClick={handlePin}
                disabled={loading}
                className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? t.common.saving : t.contextMenu.pin}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
