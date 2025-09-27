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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AvailableIcon, MediaType } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

interface MediaTypeContextMenuProps {
  children: React.ReactNode;
  mediaType: MediaType;
  datasetId: string;
  isPinned?: boolean;
  onPin?: (iconName: string, name: string) => void;
  onUnpin?: () => void;
}

const MEDIA_TYPE_NAMES: Record<MediaType, string> = {
  image: 'Images',
  comic: 'Comics',
  video: 'Videos',
};

const DEFAULT_MEDIA_TYPE_ICONS: Record<MediaType, AvailableIcon> = {
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
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pin dialog state
  const [pinName, setPinName] = useState(MEDIA_TYPE_NAMES[mediaType]);
  const [selectedIcon, setSelectedIcon] = useState<AvailableIcon>(
    DEFAULT_MEDIA_TYPE_ICONS[mediaType]
  );

  const handlePin = async () => {
    if (!pinName.trim() || !onPin) return;

    setLoading(true);
    try {
      await onPin(selectedIcon, pinName.trim());
      setShowPinDialog(false);
    } catch (error) {
      console.error('Pin creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openPinDialog = () => {
    setPinName(MEDIA_TYPE_NAMES[mediaType]);
    setSelectedIcon(DEFAULT_MEDIA_TYPE_ICONS[mediaType]);
    setShowPinDialog(true);
  };

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
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
              ピン解除
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={openPinDialog}>
              <Pin className="w-4 h-4 mr-2" />
              ピン設定
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Pin Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {MEDIA_TYPE_NAMES[mediaType]} をピン設定
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              ヘッダーナビゲーションに表示される名前とアイコンを設定してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="pin-name" className="text-gray-700">
                表示名 *
              </Label>
              <Input
                id="pin-name"
                type="text"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
                placeholder="表示名を入力"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">アイコン</Label>
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
              <p className="text-xs text-gray-500">選択中: {selectedIcon}</p>
            </div>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPinDialog(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </Button>
              <Button
                onClick={handlePin}
                disabled={loading || !pinName.trim()}
                className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'ピン設定中...' : 'ピン設定'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
