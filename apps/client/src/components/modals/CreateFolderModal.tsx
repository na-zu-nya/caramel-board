import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { currentDatasetAtom } from '@/stores/ui';
import { useParams } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { useState } from 'react';

interface CreateFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateFolderModal({ open, onOpenChange, onSuccess }: CreateFolderModalProps) {
  const params = useParams({ strict: false });
  const currentDataset = useAtomValue(currentDatasetAtom);
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const defaultFolderIcon = '📁';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !datasetId) return;

    setLoading(true);
    try {
      await apiClient.createCollectionFolder({
        name: name.trim(),
        icon: defaultFolderIcon,
        dataSetId: Number.parseInt(datasetId),
      });

      onSuccess?.();
      onOpenChange(false);

      // Reset form
      setName('');
    } catch (error) {
      console.error('Folder creation error:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form
    setName('');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-gray-200 pb-4">
          <DialogTitle className="text-lg font-semibold text-gray-900">Create Folder</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="folder-name" className="text-gray-700">
              Folder name *
            </Label>
            <Input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !datasetId}
              className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
