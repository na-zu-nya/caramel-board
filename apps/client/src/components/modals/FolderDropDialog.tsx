import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FolderUploadMode } from '@/lib/folder-import';

interface FolderDropDialogProps {
  open: boolean;
  folderName: string;
  fileCount: number;
  onCancel: () => void;
  onConfirm: (mode: FolderUploadMode, options: { collectionName?: string }) => Promise<void>;
}

export function FolderDropDialog({
  open,
  folderName,
  fileCount,
  onCancel,
  onConfirm,
}: FolderDropDialogProps) {
  const [mode, setMode] = useState<FolderUploadMode>('single-stack');
  const [collectionName, setCollectionName] = useState<string>(folderName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode('single-stack');
      setCollectionName(folderName);
      setIsSubmitting(false);
    }
  }, [open, folderName]);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(mode, { collectionName });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg space-y-6">
        <DialogHeader>
          <DialogTitle className="text-left text-lg font-semibold text-gray-900">
            Add folder “{folderName}”
          </DialogTitle>
          <p className="mt-1 text-left text-sm text-muted-foreground">
            {fileCount} file{fileCount === 1 ? '' : 's'} detected. Choose how you want to import
            them.
          </p>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as FolderUploadMode)}
          className="space-y-4"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 transition hover:border-gray-200">
            <RadioGroupItem value="single-stack" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Merge into a single stack</p>
              <p className="text-xs text-muted-foreground">
                Upload the first file as a new stack and append the remaining files to it.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 transition hover:border-gray-200">
            <RadioGroupItem value="create-collection" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Create a new collection</p>
              <p className="text-xs text-muted-foreground">
                Build a stack from each file and organize them inside a new collection.
              </p>
              {mode === 'create-collection' && (
                <div className="pt-2">
                  <Input
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                    placeholder="Collection name"
                  />
                </div>
              )}
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-transparent p-3 transition hover:border-gray-200">
            <RadioGroupItem value="flat-upload" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">Add as individual uploads</p>
              <p className="text-xs text-muted-foreground">
                Push the files into the existing upload queue without preserving the folder
                structure.
              </p>
            </div>
          </label>
        </RadioGroup>

        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (mode === 'create-collection' && !collectionName.trim())}
          >
            {isSubmitting ? 'Working…' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
