import {
  Download,
  Folder,
  FolderPlus,
  GitMerge,
  NotebookText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  StackContextCollectionMenuProps,
  StackContextMenuCollection,
} from '@/components/ui/Stack/StackContextMenuContent';
import type { SelectionAction } from '@/components/ui/selection-action-bar';

interface StackSelectionActionCopy {
  bulkEdit: string;
  downloadSelected: (count: number) => string;
  addToScratch: string;
  addToCollection: string;
  createNewCollection: string;
  collectionLoading: string;
  noCollectionsAvailable: string;
  mergeStacks: string;
  refresh: string;
  removeFromCollection: string;
  removeFromScratch: string;
  deleteStacks: string;
  deleteStacksConfirm: (count: number) => string;
}

interface StackSelectionActionHandler {
  onSelect: () => void;
}

interface StackSelectionMergeAction extends StackSelectionActionHandler {
  confirmMessage?: string;
}

interface CreateStackSelectionActionsOptions {
  selectedCount: number;
  copy: StackSelectionActionCopy;
  bulkEdit?: StackSelectionActionHandler;
  downloadSelected?: StackSelectionActionHandler;
  addToScratch?: StackSelectionActionHandler;
  collectionMenu?: StackContextCollectionMenuProps;
  mergeStacks?: StackSelectionMergeAction;
  refresh?: StackSelectionActionHandler;
  removeFromCollection?: StackSelectionActionHandler;
  removeFromScratch?: StackSelectionActionHandler;
  deleteStacks?: StackSelectionActionHandler;
}

function createCollectionActions({
  items,
  onAddToCollection,
}: {
  items: readonly StackContextMenuCollection[];
  onAddToCollection: (collectionId: number) => void | Promise<void>;
}): SelectionAction[] {
  return items.map((item) => {
    if (item.kind === 'folder') {
      return {
        label: item.name,
        value: `collection-folder-${item.id}`,
        icon: <Folder size={12} />,
        disabled: item.children.length === 0,
        children:
          item.children.length > 0
            ? createCollectionActions({ items: item.children, onAddToCollection })
            : undefined,
      };
    }

    return {
      label: item.name,
      value: `collection-${item.id}`,
      onSelect: () => {
        void onAddToCollection(item.id);
      },
    };
  });
}

export function createStackSelectionActions({
  selectedCount,
  copy,
  bulkEdit,
  downloadSelected,
  addToScratch,
  collectionMenu,
  mergeStacks,
  refresh,
  removeFromCollection,
  removeFromScratch,
  deleteStacks,
}: CreateStackSelectionActionsOptions): SelectionAction[] {
  if (selectedCount === 0) return [];

  const actions: SelectionAction[] = [];

  if (bulkEdit) {
    actions.push({
      label: copy.bulkEdit,
      value: 'bulk-edit',
      onSelect: bulkEdit.onSelect,
      icon: <Pencil size={12} />,
      group: 'primary',
    });
  }

  if (downloadSelected) {
    actions.push({
      label: copy.downloadSelected(selectedCount),
      value: 'download-selected',
      onSelect: downloadSelected.onSelect,
      icon: <Download size={12} />,
      group: 'primary',
    });
  }

  if (refresh) {
    actions.push({
      label: copy.refresh,
      value: 'refresh',
      onSelect: refresh.onSelect,
      icon: <RefreshCw size={12} />,
      group: 'primary',
    });
  }

  if (addToScratch) {
    actions.push({
      label: copy.addToScratch,
      value: 'add-to-scratch',
      onSelect: addToScratch.onSelect,
      icon: <NotebookText size={12} />,
      group: 'secondary',
    });
  }

  if (collectionMenu) {
    actions.push({
      label: copy.addToCollection,
      value: 'add-to-collection',
      icon: <FolderPlus size={12} />,
      group: 'secondary',
      children: [
        {
          label: copy.createNewCollection,
          value: 'create-new-collection',
          onSelect: collectionMenu.onCreateCollection,
          icon: <Plus size={12} />,
        },
        ...(collectionMenu.isLoading
          ? [
              {
                label: copy.collectionLoading,
                value: 'collections-loading',
                disabled: true,
              },
            ]
          : collectionMenu.collections.length === 0
            ? [
                {
                  label: copy.noCollectionsAvailable,
                  value: 'no-collections-available',
                  disabled: true,
                },
              ]
            : createCollectionActions({
                items: collectionMenu.collections,
                onAddToCollection: collectionMenu.onAddToCollection,
              })),
      ],
    });
  }

  if (mergeStacks) {
    actions.push({
      label: copy.mergeStacks,
      value: 'merge-stacks',
      onSelect: mergeStacks.onSelect,
      icon: <GitMerge size={12} />,
      confirmMessage: mergeStacks.confirmMessage,
      group: 'secondary',
    });
  }

  if (removeFromCollection) {
    actions.push({
      label: copy.removeFromCollection,
      value: 'remove-from-collection',
      onSelect: removeFromCollection.onSelect,
      icon: <Trash2 size={12} />,
      destructive: true,
    });
  }

  if (removeFromScratch) {
    actions.push({
      label: copy.removeFromScratch,
      value: 'remove-from-scratch',
      onSelect: removeFromScratch.onSelect,
      icon: <Trash2 size={12} />,
      destructive: true,
    });
  }

  if (deleteStacks) {
    actions.push({
      label: copy.deleteStacks,
      value: 'delete-stacks',
      onSelect: deleteStacks.onSelect,
      icon: <Trash2 size={12} />,
      confirmMessage: copy.deleteStacksConfirm(selectedCount),
      destructive: true,
    });
  }

  return actions;
}
