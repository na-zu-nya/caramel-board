import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Pencil, Pin, PinOff, Search, Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { memo, useCallback, useEffect, useState } from 'react';
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
import { useT } from '@/lib/i18n';
import type { AvailableIcon, Collection } from '@/types';
import { AVAILABLE_ICONS } from '@/types';

const restoreBodyPointerEvents = () => {
  if (typeof document === 'undefined') return;
  const { style } = document.body;
  if (style.pointerEvents === 'none') {
    style.pointerEvents = 'auto';
  }
  style.removeProperty('pointer-events');
};

interface CollectionContextMenuProps {
  children: ReactNode;
  collection: Collection;
  onUpdate?: () => void;
  onDelete?: () => void;
  isPinned?: boolean;
  onPin?: (iconName: string) => void;
  onUnpin?: () => void;
  onOpen?: () => void;
  onFindSimilar?: () => void;
}

function CollectionContextMenuComponent({
  children,
  collection,
  onUpdate,
  onDelete,
  isPinned,
  onPin,
  onUnpin,
  onOpen,
  onFindSimilar,
}: CollectionContextMenuProps) {
  const t = useT();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      restoreBodyPointerEvents();
    };
  }, []);

  useEffect(() => {
    if (!showRenameDialog && !showDeleteDialog && !showPinDialog) {
      restoreBodyPointerEvents();
    }
  }, [showDeleteDialog, showPinDialog, showRenameDialog]);

  // Rename dialog state
  const [name, setName] = useState(collection.name);

  // Pin dialog state
  const [selectedPinIcon, setSelectedPinIcon] = useState<AvailableIcon>('BookText');

  const closeRenameDialog = useCallback(() => {
    setShowRenameDialog(false);
    setLoading(false);
    restoreBodyPointerEvents();
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
    setLoading(false);
    restoreBodyPointerEvents();
  }, []);

  const closePinDialog = useCallback(() => {
    setShowPinDialog(false);
    setLoading(false);
    restoreBodyPointerEvents();
  }, []);

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setShowRenameDialog(true);
      } else {
        closeRenameDialog();
      }
    },
    [closeRenameDialog]
  );

  const handlePinDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setShowPinDialog(true);
      } else {
        closePinDialog();
      }
    },
    [closePinDialog]
  );

  const handleRename = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await apiClient.updateCollection(collection.id, {
        name: name.trim(),
      });

      onUpdate?.();
      closeRenameDialog();
    } catch (error) {
      console.error('コレクション更新エラー:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async () => {
    setLoading(true);
    try {
      await apiClient.deleteCollection(collection.id);
      closeDeleteDialog();
      onDelete?.();
    } catch (error) {
      console.error('コレクション削除エラー:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  }, [closeDeleteDialog, collection.id, onDelete]);

  const handleDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setShowDeleteDialog(true);
      } else {
        closeDeleteDialog();
      }
    },
    [closeDeleteDialog]
  );

  const closeMenu = useCallback(() => {
    restoreBodyPointerEvents();
  }, []);

  const handlePin = useCallback(async () => {
    if (!onPin) return;

    setLoading(true);
    try {
      await onPin(selectedPinIcon);
      closePinDialog();
    } catch (error) {
      console.error('Pin creation error:', error);
    } finally {
      setLoading(false);
    }
  }, [closePinDialog, onPin, selectedPinIcon]);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setLoading(false);
      restoreBodyPointerEvents();
    }
  }, []);

  const openRenameDialog = () => {
    closeMenu();
    setName(collection.name);
    setShowRenameDialog(true);
  };

  const openPinDialog = useCallback(() => {
    closeMenu();
    setSelectedPinIcon('BookText');
    setShowPinDialog(true);
  }, [closeMenu]);

  const handleFindSimilar = useCallback(() => {
    closeMenu();
    onFindSimilar?.();
  }, [closeMenu, onFindSimilar]);

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string) => {
    /* biome-ignore lint/performance/noDynamicNamespaceImportAccess: dynamic icon lookup for user-selected pin icons */
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
      <ContextMenu onOpenChange={handleMenuOpenChange}>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        {isMenuOpen ? (
          <ContextMenuContent className="w-44">
            <ContextMenuItem onSelect={onOpen}>{t.contextMenu.open}</ContextMenuItem>
            <ContextMenuItem onSelect={handleFindSimilar}>
              <Search className="w-4 h-4 mr-2" />
              {t.contextMenu.findSimilar}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={openRenameDialog}>
              <Pencil className="w-4 h-4 mr-2" />
              {t.common.edit}
            </ContextMenuItem>
            <ContextMenuSeparator />
            {isPinned ? (
              <ContextMenuItem onSelect={onUnpin}>
                <PinOff className="w-4 h-4 mr-2" />
                {t.contextMenu.unpin}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={openPinDialog}>
                <Pin className="w-4 h-4 mr-2" />
                {t.contextMenu.pin}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-red-600 focus:text-red-600 hover:text-red-600"
              onSelect={() => {
                closeMenu();
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t.common.delete}
            </ContextMenuItem>
          </ContextMenuContent>
        ) : null}
      </ContextMenu>

      {showRenameDialog ? (
        <Dialog open={showRenameDialog} onOpenChange={handleRenameDialogOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="border-b border-gray-200 pb-4">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {t.collection.editCollection}
              </DialogTitle>
            </DialogHeader>

            <form className="space-y-6 pt-2" onSubmit={handleRename}>
              <div className="space-y-2">
                <Label htmlFor="edit-name" className="text-gray-700">
                  {t.collection.collectionName} *
                </Label>
                <Input
                  id="edit-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.contextMenu.enterCollectionName}
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeRenameDialog}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {t.common.cancel}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? t.common.updating : t.common.update}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {showDeleteDialog ? (
        <Dialog open={showDeleteDialog} onOpenChange={handleDeleteDialogOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="border-b border-gray-200 pb-4">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {t.collection.deleteCollection}
              </DialogTitle>
              <DialogDescription className="text-gray-600 mt-2">
                {t.collection.deleteCollectionConfirm(collection.name)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={closeDeleteDialog}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t.common.cancel}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? t.common.deleting : t.common.delete}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {showPinDialog ? (
        <Dialog open={showPinDialog} onOpenChange={handlePinDialogOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="border-b border-gray-200 pb-4">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {t.collection.pinCollection(collection.name)}
              </DialogTitle>
              <DialogDescription className="text-gray-600 mt-2">
                {t.collection.setHeaderPinDisplay}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-2">
              <div className="space-y-2">
                <Label className="text-gray-700">{t.pins.name}</Label>
                <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {collection.name}
                </div>
                <p className="text-sm text-gray-500">{t.pins.nameFixed}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-700">{t.contextMenu.icon}</Label>
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
                <p className="text-xs text-gray-500">
                  {t.collection.selected} {selectedPinIcon}
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closePinDialog}
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
                  {loading ? t.contextMenu.pinning : t.contextMenu.pin}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export const CollectionContextMenu = memo(CollectionContextMenuComponent);
CollectionContextMenu.displayName = 'CollectionContextMenu';
