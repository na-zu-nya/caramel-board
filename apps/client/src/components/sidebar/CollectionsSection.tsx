import { CreateCollectionModal } from '@/components/modals/CreateCollectionModal';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { FolderTreeView } from '@/components/sidebar/FolderTreeView';
import { SideMenuGroup } from '@/components/ui/SideMenu';
import { SideMenuMessage } from '@/components/ui/SideMenu';
import type { CollectionsSectionProps } from '@/components/sidebar/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { BookText, FolderPlus } from 'lucide-react';
import { useState } from 'react';

export function CollectionsSection({
  datasetId,
  isCollapsed = false,
  onToggle,
  isPinned,
  onPinCollection,
  onUnpinCollection,
  onCollectionCreated,
  onCollectionChanged,
}: CollectionsSectionProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalType, setCreateModalType] = useState<'MANUAL' | 'SMART'>('MANUAL');
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);

  // Fetch collections and folders for current dataset
  const { data: collectionData, isLoading: loadingCollections } = useQuery({
    queryKey: ['collection-folders', datasetId],
    queryFn: async () => {
      if (!datasetId) return { folders: [], rootCollections: [] };
      return apiClient.getCollectionFolderTree({
        dataSetId: Number.parseInt(datasetId),
        includeCollections: true,
      });
    },
    enabled: !!datasetId,
  });

  const folders = collectionData?.folders || [];
  const rootCollections = collectionData?.rootCollections || [];

  const actions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-0.5 hover:bg-gray-100 rounded transition-colors"
            aria-label="Create collection"
          >
            <BookText size={16} className="text-gray-600" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setCreateModalType('MANUAL');
              setCreateModalOpen(true);
            }}
          >
            Create Collection
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setCreateModalType('SMART');
              setCreateModalOpen(true);
            }}
          >
            Create Smart Collection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className="p-0.5 hover:bg-gray-100 rounded transition-colors"
        aria-label="Create folder"
        onClick={() => setCreateFolderModalOpen(true)}
      >
        <FolderPlus size={16} className="text-gray-600" />
      </button>
    </>
  );

  return (
    <>
      <SideMenuGroup
        label="Collections"
        collapsed={isCollapsed}
        onToggle={onToggle}
        action={actions}
      >
        <nav className="space-y-0.5">
          {loadingCollections ? (
            <SideMenuMessage>Loading...</SideMenuMessage>
          ) : folders.length === 0 && rootCollections.length === 0 ? (
            <SideMenuMessage>No Collections or Folders</SideMenuMessage>
          ) : (
            <FolderTreeView
              folders={folders}
              rootCollections={rootCollections}
              isPinned={isPinned}
              onCollectionUpdate={onCollectionChanged}
              onCollectionDelete={onCollectionChanged}
              onCollectionPin={onPinCollection}
              onCollectionUnpin={onUnpinCollection}
              onStackAdded={onCollectionChanged}
            />
          )}
        </nav>
      </SideMenuGroup>

      {/* Create Collection Modal */}
      <CreateCollectionModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={onCollectionCreated}
        type={createModalType}
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        open={createFolderModalOpen}
        onOpenChange={setCreateFolderModalOpen}
        onSuccess={onCollectionCreated}
      />
    </>
  );
}
