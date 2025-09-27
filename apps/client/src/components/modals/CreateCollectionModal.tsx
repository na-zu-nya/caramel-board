import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { currentDatasetAtom } from '@/stores/ui';
import type { CollectionFolder, CollectionType } from '@/types';
import { useParams } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';

interface CreateCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  type?: CollectionType;
}

export function CreateCollectionModal({
  open,
  onOpenChange,
  onSuccess,
  type,
}: CreateCollectionModalProps) {
  const params = useParams({ strict: false });
  const currentDataset = useAtomValue(currentDatasetAtom);
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [collectionType, setCollectionType] = useState<CollectionType>(type || 'MANUAL');
  const [selectedFolderId, setSelectedFolderId] = useState<number | undefined>();
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    if (type) {
      setCollectionType(type);
    }
  }, [type]);

  // Load folders when modal opens
  useEffect(() => {
    if (open && datasetId) {
      loadFolders();
    }
  }, [open, datasetId]);

  const loadFolders = async () => {
    setLoadingFolders(true);
    try {
      const response = await apiClient.getCollectionFolders({
        dataSetId: Number.parseInt(datasetId),
        includeCollections: false,
        limit: 100,
      });
      setFolders(response.folders);
    } catch (error) {
      console.error('フォルダ取得エラー:', error);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Create a flat list of folders for the select dropdown
  const flattenFolders = (
    folders: CollectionFolder[],
    level = 0
  ): Array<{ folder: CollectionFolder; level: number }> => {
    const result: Array<{ folder: CollectionFolder; level: number }> = [];

    for (const folder of folders) {
      result.push({ folder, level });
      if (folder.children && folder.children.length > 0) {
        result.push(...flattenFolders(folder.children, level + 1));
      }
    }

    return result;
  };

  const flatFolders = flattenFolders(folders);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !datasetId) return;

    setLoading(true);
    try {
      await apiClient.createCollection({
        name: name.trim(),
        type: collectionType,
        dataSetId: Number.parseInt(datasetId),
        folderId: selectedFolderId,
      });

      onSuccess?.();
      onOpenChange(false);

      // Reset form
      setName('');
      setCollectionType(type || 'MANUAL');
      setSelectedFolderId(undefined);
    } catch (error) {
      console.error('コレクション作成エラー:', error);
      // TODO: エラー表示
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset form
    setName('');
    setCollectionType(type || 'MANUAL');
    setSelectedFolderId(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-gray-200 pb-4">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            {collectionType === 'SMART' ? 'Create Smart Collection' : 'Create Collection'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label htmlFor="collection-name" className="text-gray-700">
              Name *
            </Label>
            <Input
              id="collection-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection Name"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-type" className="text-gray-700">
              Type
            </Label>
            <Select
              value={collectionType}
              onValueChange={(value: CollectionType) => setCollectionType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Collection</SelectItem>
                <SelectItem value="SMART">Smart Collection</SelectItem>
              </SelectContent>
            </Select>
            {collectionType === 'SMART' && (
              <p className="text-sm text-muted-foreground">
                Automatically display stacks based on filter conditions
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-folder" className="text-gray-700">
              Folder
            </Label>
            <Select
              value={selectedFolderId ? String(selectedFolderId) : 'root'}
              onValueChange={(value) =>
                setSelectedFolderId(value === 'root' ? undefined : Number.parseInt(value))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Create at root (without folder)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Create at root (without folder)</SelectItem>
                {loadingFolders ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : flatFolders.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    No folders available
                  </SelectItem>
                ) : (
                  flatFolders.map(({ folder, level }) => (
                    <SelectItem key={folder.id} value={String(folder.id)}>
                      <span style={{ paddingLeft: `${level * 16}px` }}>
                        {folder.icon} {folder.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              You can select folders to organize your collection
            </p>
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
