import { useNavigate } from '@tanstack/react-router';
import { Eraser, FolderPlus } from 'lucide-react';
import { useState } from 'react';
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
import { useScratch } from '@/hooks/useScratch';
import { useT } from '@/lib/i18n';

interface ScratchContextMenuProps {
  datasetId: string;
  scratchId?: number;
  children: React.ReactNode;
}

export function ScratchContextMenu({ datasetId, scratchId, children }: ScratchContextMenuProps) {
  const t = useT();
  const navigate = useNavigate();
  const { clearScratch, isClearing, convertScratch, isConverting } = useScratch(datasetId);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [newName, setNewName] = useState('Scratch Export');

  const handleClear = async () => {
    if (!scratchId) return;
    await clearScratch(scratchId);
    setShowClearDialog(false);
    try {
      // 通知: 現在のビュー（Scratchページ）が開いていれば即時リフレッシュ
      window.dispatchEvent(new CustomEvent('scratch-cleared', { detail: { id: scratchId } }));
    } catch {}
  };

  const handleConvert = async () => {
    if (!scratchId || !newName.trim()) return;
    const result = await convertScratch({
      collectionId: scratchId,
      dataSetId: datasetId,
      name: newName.trim(),
    });
    setShowConvertDialog(false);
    // 変換後のコレクションへ遷移
    const newId = result?.newCol.id;
    if (newId) {
      navigate({
        to: '/library/$datasetId/collections/$collectionId',
        params: { datasetId, collectionId: String(newId) },
      });
    }
    try {
      // Scratch 側が空になった旨を通知
      window.dispatchEvent(new CustomEvent('scratch-cleared', { detail: { id: scratchId } }));
    } catch {}
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={() => setShowClearDialog(true)} disabled={!scratchId}>
            <Eraser className="w-4 h-4 mr-2" />
            {t.contextMenu.clearScratch}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => setShowConvertDialog(true)} disabled={!scratchId}>
            <FolderPlus className="w-4 h-4 mr-2" />
            {t.contextMenu.toCollection}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Clear Confirmation */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t.contextMenu.clearScratch}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t.contextMenu.clearScratchConfirm}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              disabled={isClearing}
            >
              {t.common.cancel}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleClear}
              disabled={isClearing}
            >
              {isClearing ? t.contextMenu.clearing : t.contextMenu.clear}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b border-gray-200 pb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t.contextMenu.convertToCollection}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              {t.contextMenu.convertDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-name" className="text-gray-700">
                {t.contextMenu.collectionName}
              </Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.contextMenu.enterCollectionName}
              />
            </div>
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setShowConvertDialog(false)}
                disabled={isConverting}
              >
                {t.common.cancel}
              </Button>
              <Button onClick={handleConvert} disabled={isConverting || !newName.trim()}>
                {isConverting ? t.contextMenu.converting : t.contextMenu.convert}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
