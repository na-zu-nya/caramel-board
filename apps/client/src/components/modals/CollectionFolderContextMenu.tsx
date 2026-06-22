import { Pencil, Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { CollectionFolder } from '@/types';

interface CollectionFolderContextMenuProps {
  folder: CollectionFolder;
  children: ReactNode;
  onOpen?: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

const restoreBodyPointerEvents = () => {
  if (typeof document === 'undefined') return;
  const { style } = document.body;
  if (style.pointerEvents === 'none') {
    style.pointerEvents = 'auto';
  }
  style.removeProperty('pointer-events');
};

export function CollectionFolderContextMenu({
  folder,
  children,
  onOpen,
  onUpdated,
  onDeleted,
}: CollectionFolderContextMenuProps) {
  const t = useT();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setName(folder.name);
  }, [folder.name]);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleRenameOpen = useCallback(() => {
    closeMenu();
    setName(folder.name);
    setIsRenameDialogOpen(true);
  }, [closeMenu, folder.name]);

  const handleDeleteOpen = useCallback(() => {
    closeMenu();
    setIsDeleteDialogOpen(true);
  }, [closeMenu]);

  useEffect(() => {
    if (!isRenameDialogOpen && !isDeleteDialogOpen) {
      restoreBodyPointerEvents();
    }
    return () => {
      restoreBodyPointerEvents();
    };
  }, [isRenameDialogOpen, isDeleteDialogOpen]);

  const canSubmit = useMemo(() => name.trim().length > 0, [name]);

  const handleRename = useCallback(
    async (event?: FormEvent) => {
      if (event) {
        event.preventDefault();
      }
      if (!canSubmit || isProcessing) return;

      try {
        setIsProcessing(true);
        await apiClient.updateCollectionFolder(folder.id, { name: name.trim() });
        setIsRenameDialogOpen(false);
        onUpdated?.();
      } catch (error) {
        console.error('Failed to rename folder:', error);
      } finally {
        setIsProcessing(false);
      }
    },
    [canSubmit, folder.id, name, isProcessing, onUpdated]
  );

  const handleDelete = useCallback(async () => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      await apiClient.deleteCollectionFolder(folder.id);
      setIsDeleteDialogOpen(false);
      onDeleted?.();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [folder.id, isProcessing, onDeleted]);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setIsProcessing(false);
    }
  }, []);

  return (
    <>
      <ContextMenu open={isMenuOpen} onOpenChange={handleMenuOpenChange}>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem
            onSelect={() => {
              onOpen?.();
            }}
          >
            {t.contextMenu.open}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleRenameOpen}>
            <Pencil className="w-4 h-4 mr-2" />
            {t.contextMenu.rename}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-600 focus:text-red-600 hover:text-red-600"
            onSelect={handleDeleteOpen}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {t.common.remove}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t.collection.renameFolder}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t.collection.updateFolderName(folder.name)}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-6 pt-2" onSubmit={handleRename}>
            <div className="space-y-2">
              <Label htmlFor="folder-rename" className="text-gray-700">
                {t.collection.folderName} *
              </Label>
              <Input
                id="folder-rename"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isProcessing}
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRenameDialogOpen(false)}
                disabled={isProcessing}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || isProcessing}
                className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? t.common.updating : t.common.update}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t.collection.removeFolder}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t.collection.removeFolderConfirm(folder.name)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isProcessing}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isProcessing}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? t.common.removing : t.common.remove}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
