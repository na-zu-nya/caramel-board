import { useParams } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
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
import { useT } from '@/lib/i18n';
import { currentDatasetAtom } from '@/stores/ui';
import type { Collection, CollectionFolder, CollectionType } from '@/types';

interface CreateCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (collection: Collection) => void | Promise<void>;
  type?: CollectionType;
  lockType?: boolean;
}

export function CreateCollectionModal({
  open,
  onOpenChange,
  onSuccess,
  type,
  lockType = false,
}: CreateCollectionModalProps) {
  const t = useT();
  const params = useParams({ strict: false });
  const currentDataset = useAtomValue(currentDatasetAtom);
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [collectionType, setCollectionType] = useState<CollectionType>(type || 'MANUAL');
  const [selectedFolderId, setSelectedFolderId] = useState<number | undefined>();
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const response = await apiClient.getCollectionFolders({
        dataSetId: Number.parseInt(datasetId, 10),
        includeCollections: false,
        limit: 100,
      });
      setFolders(response.folders);
    } catch (error) {
      console.error('フォルダ取得エラー:', error);
    } finally {
      setLoadingFolders(false);
    }
  }, [datasetId]);

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
  }, [open, datasetId, loadFolders]);

  const flatFolders = flattenFolders(folders);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !datasetId) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const payload: {
        name: string;
        type: CollectionType;
        dataSetId: number;
        folderId?: number;
        filterConfig?: Record<string, unknown>;
      } = {
        name: name.trim(),
        type: collectionType,
        dataSetId: Number.parseInt(datasetId, 10),
        folderId: selectedFolderId,
      };

      if (collectionType === 'SMART') {
        payload.filterConfig = {};
      }

      const collection = await apiClient.createCollection(payload);

      await onSuccess?.(collection);
      onOpenChange(false);

      // Reset form
      setName('');
      setCollectionType(type || 'MANUAL');
      setSelectedFolderId(undefined);
      setErrorMessage(null);
    } catch (error) {
      console.error('コレクション作成エラー:', error);
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('コレクションの作成に失敗しました。');
      }
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
    setErrorMessage(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-gray-200 pb-4">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            {collectionType === 'SMART'
              ? t.collection.createSmartCollection
              : t.collection.createCollection}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {errorMessage && (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
              role="alert"
            >
              {errorMessage}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="collection-name" className="text-gray-700">
              {t.common.name}
            </Label>
            <Input
              id="collection-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.collection.collectionName}
              required
              autoFocus
            />
          </div>

          {!lockType ? (
            <div className="space-y-2">
              <Label htmlFor="collection-type" className="text-gray-700">
                {t.collection.type}
              </Label>
              <Select
                value={collectionType}
                onValueChange={(value: CollectionType) => setCollectionType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">{t.collection.collection}</SelectItem>
                  <SelectItem value="SMART">{t.collection.smartCollection}</SelectItem>
                </SelectContent>
              </Select>
              {collectionType === 'SMART' && (
                <p className="text-sm text-muted-foreground">{t.collection.smartDescription}</p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="collection-folder" className="text-gray-700">
              {t.collection.folder}
            </Label>
            <Select
              value={selectedFolderId ? String(selectedFolderId) : 'root'}
              onValueChange={(value) =>
                setSelectedFolderId(value === 'root' ? undefined : Number.parseInt(value, 10))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t.collection.createAtRoot} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">{t.collection.createAtRoot}</SelectItem>
                {loadingFolders ? (
                  <SelectItem value="loading" disabled>
                    {t.collection.loading}
                  </SelectItem>
                ) : flatFolders.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    {t.collection.noFoldersAvailable}
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
            <p className="text-sm text-muted-foreground">{t.collection.folderHint}</p>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !datasetId}
              className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t.common.creating : t.common.create}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
