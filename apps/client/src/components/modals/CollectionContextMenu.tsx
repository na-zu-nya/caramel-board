import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
import { apiClient } from '@/lib/api-client';
import { AVAILABLE_ICONS } from '@/types';
import type { AvailableIcon, Collection } from '@/types';
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useState } from 'react';

interface CollectionContextMenuProps {
  children: React.ReactNode;
  collection: Collection;
  onUpdate?: () => void;
  onDelete?: () => void;
  isPinned?: boolean;
  onPin?: (iconName: string, name: string) => void;
  onUnpin?: () => void;
  onOpen?: () => void;
}

export function CollectionContextMenu({
  children,
  collection,
  onUpdate,
  onDelete,
  isPinned,
  onPin,
  onUnpin,
  onOpen,
}: CollectionContextMenuProps) {
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  // Rename dialog state
  const [name, setName] = useState(collection.name);

  // Pin dialog state
  const [pinName, setPinName] = useState(collection.name);
  const [selectedPinIcon, setSelectedPinIcon] = useState<AvailableIcon>('BookText');

  const handleRename = async () => {
    if (!name.trim()) return;

    setLoading(true);
    try {
      await apiClient.updateCollection(collection.id, {
        name: name.trim(),
      });

      onUpdate?.();
      setShowRenameDialog(false);
    } catch (error) {
      console.error('コレクション更新エラー:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiClient.deleteCollection(collection.id);
      onDelete?.();
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('コレクション削除エラー:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  };

  const handlePin = async () => {
    if (!pinName.trim() || !onPin) return;

    setLoading(true);
    try {
      await onPin(selectedPinIcon, pinName.trim());
      setShowPinDialog(false);
    } catch (error) {
      console.error('Pin creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openRenameDialog = () => {
    setName(collection.name);
    setShowRenameDialog(true);
  };

  const openPinDialog = () => {
    setPinName(collection.name);
    setSelectedPinIcon('BookText');
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
          <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={openRenameDialog}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </ContextMenuItem>
          <ContextMenuSeparator />
          {isPinned ? (
            <ContextMenuItem onClick={onUnpin}>
              <PinOff className="w-4 h-4 mr-2" />
              Unpin
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={openPinDialog}>
              <Pin className="w-4 h-4 mr-2" />
              Pin
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-600 focus:text-red-600 hover:text-red-600"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Edit Collection
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-gray-700">
                Collection Name *
              </Label>
              <Input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter collection name"
                required
              />
            </div>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRenameDialog(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRename}
                disabled={loading || !name.trim()}
                className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Updating...' : 'Update'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Delete Collection
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Delete collection "{collection.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pin Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              Pin {collection.name}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Set the name and icon to display in the header navigation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="pin-name" className="text-gray-700">
                Display Name *
              </Label>
              <Input
                id="pin-name"
                type="text"
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
                placeholder="Enter display name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700">Icon</Label>
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                {AVAILABLE_ICONS.map((iconName) => (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setSelectedPinIcon(iconName)}
                    className={`p-2 rounded-md border transition-colors ${
                      selectedPinIcon === iconName
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    title={iconName}
                  >
                    {renderIcon(iconName)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">Selected: {selectedPinIcon}</p>
            </div>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPinDialog(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePin}
                disabled={loading || !pinName.trim()}
                className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Pinning...' : 'Pin'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
