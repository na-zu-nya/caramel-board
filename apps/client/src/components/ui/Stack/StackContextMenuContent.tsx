import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  GalleryVerticalEnd,
  GitMerge,
  HeartOff,
  Info,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { useT } from '@/lib/i18n';

export type StackContextMenuCollection =
  | {
      kind: 'collection';
      id: number;
      name: string;
      icon?: string;
    }
  | {
      kind: 'folder';
      id: number;
      name: string;
      children: readonly StackContextMenuCollection[];
    };

export interface StackContextCollectionMenuProps {
  collections: readonly StackContextMenuCollection[];
  isLoading?: boolean;
  onCreateCollection: () => void | Promise<void>;
  onAddToCollection: (collectionId: number) => void | Promise<void>;
}

interface StackContextMenuContentProps {
  isSelectionContext?: boolean;
  selectedActionCount?: number;
  onOpen?: () => void | Promise<void>;
  onBulkEditSelected?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
  onInfo?: () => void | Promise<void>;
  onFindSimilar?: () => void | Promise<void>;
  onAddToScratch?: () => void | Promise<void>;
  collectionMenu?: StackContextCollectionMenuProps;
  onMergeSelected?: () => void | Promise<void>;
  onRemoveLike?: () => void | Promise<void>;
  onRemoveFromCollection?: () => void | Promise<void>;
  onRemoveFromScratch?: () => void | Promise<void>;
  onRemoveStack?: () => void | Promise<void>;
}

const DEFAULT_COLLECTION_ICON = 'BookText';
const FOLDER_ICON_VALUES = new Set(['folder', '📁', '📂']);

function normalizeCollectionIcon(icon?: string): string {
  const trimmedIcon = icon?.trim();
  if (!trimmedIcon || FOLDER_ICON_VALUES.has(trimmedIcon.toLowerCase())) {
    return DEFAULT_COLLECTION_ICON;
  }
  return trimmedIcon;
}

function toPascalIconName(icon: string): string {
  return icon
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function resolveLucideIcon(icon: string): LucideIcon | null {
  const candidates = [icon, toPascalIconName(icon)];

  for (const candidate of candidates) {
    /* biome-ignore lint/performance/noDynamicNamespaceImportAccess: collection icons are user-configured Lucide names */
    const IconComponent = LucideIcons[candidate as keyof typeof LucideIcons] as
      | LucideIcon
      | undefined;
    if (IconComponent) return IconComponent;
  }

  return null;
}

function CollectionMenuIcon({ icon }: { icon?: string }) {
  const normalizedIcon = normalizeCollectionIcon(icon);
  const IconComponent = resolveLucideIcon(normalizedIcon);

  if (IconComponent) {
    return <IconComponent className="w-4 h-4 mr-2 shrink-0" />;
  }

  return (
    <span className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none">
      {normalizedIcon}
    </span>
  );
}

function CollectionMenuItems({
  items,
  onAddToCollection,
}: {
  items: readonly StackContextMenuCollection[];
  onAddToCollection: (collectionId: number) => void | Promise<void>;
}) {
  return items.map((item) => {
    if (item.kind === 'folder') {
      if (item.children.length === 0) {
        return (
          <ContextMenuItem key={`folder-${item.id}`} disabled>
            <Folder className="w-4 h-4 mr-2 shrink-0" />
            <span className="truncate">{item.name}</span>
          </ContextMenuItem>
        );
      }

      return (
        <ContextMenuSub key={`folder-${item.id}`}>
          <ContextMenuSubTrigger className="text-gray-500 focus:text-gray-700">
            <Folder className="w-4 h-4 mr-2 shrink-0 text-gray-400" />
            <span className="min-w-0 truncate">{item.name}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <CollectionMenuItems items={item.children} onAddToCollection={onAddToCollection} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }

    return (
      <ContextMenuItem
        key={`collection-${item.id}`}
        onClick={() => void onAddToCollection(item.id)}
      >
        <CollectionMenuIcon icon={item.icon} />
        <span className="truncate">{item.name}</span>
      </ContextMenuItem>
    );
  });
}

export function StackContextMenuContent({
  isSelectionContext = false,
  selectedActionCount = 0,
  onOpen,
  onBulkEditSelected,
  onDownload,
  onInfo,
  onFindSimilar,
  onAddToScratch,
  collectionMenu,
  onMergeSelected,
  onRemoveLike,
  onRemoveFromCollection,
  onRemoveFromScratch,
  onRemoveStack,
}: StackContextMenuContentProps) {
  const t = useT();
  const downloadLabel = isSelectionContext
    ? t.contextMenu.downloadSelected(selectedActionCount)
    : t.contextMenu.download;
  const deleteLabel = isSelectionContext
    ? t.contextMenu.deleteSelected(selectedActionCount)
    : t.info.removeStack;
  const hasPrimaryActions = Boolean(onOpen || onBulkEditSelected || onDownload);
  const hasSecondaryActions = Boolean(
    onInfo || onFindSimilar || onAddToScratch || collectionMenu || onMergeSelected
  );
  const hasDestructiveActions = Boolean(
    onRemoveLike || onRemoveFromCollection || onRemoveFromScratch || onRemoveStack
  );

  return (
    <ContextMenuContent className="w-48">
      {onOpen ? (
        <ContextMenuItem onClick={() => void onOpen()}>
          <ExternalLink className="w-4 h-4 mr-2" />
          {t.contextMenu.open}
        </ContextMenuItem>
      ) : null}
      {isSelectionContext && onBulkEditSelected ? (
        <ContextMenuItem onClick={() => void onBulkEditSelected()}>
          <Pencil className="w-4 h-4 mr-2" />
          {t.contextMenu.bulkEditSelected(selectedActionCount)}
        </ContextMenuItem>
      ) : null}
      {onDownload ? (
        <ContextMenuItem onClick={() => void onDownload()}>
          <Download className="w-4 h-4 mr-2" />
          {downloadLabel}
        </ContextMenuItem>
      ) : null}

      {hasPrimaryActions && hasSecondaryActions ? <ContextMenuSeparator /> : null}

      {onInfo ? (
        <ContextMenuItem onClick={() => void onInfo()}>
          <Info className="w-4 h-4 mr-2" />
          {t.contextMenu.info}
        </ContextMenuItem>
      ) : null}
      {onFindSimilar ? (
        <ContextMenuItem onClick={() => void onFindSimilar()}>
          <GalleryVerticalEnd className="w-4 h-4 mr-2" />
          {t.contextMenu.findSimilar}
        </ContextMenuItem>
      ) : null}
      {onAddToScratch ? (
        <ContextMenuItem onClick={() => void onAddToScratch()}>
          <NotebookText className="w-4 h-4 mr-2" />
          {t.contextMenu.addToScratch}
        </ContextMenuItem>
      ) : null}
      {collectionMenu ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderPlus className="w-4 h-4 mr-2" />
            {t.contextMenu.addToCollection}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <ContextMenuItem onClick={() => void collectionMenu.onCreateCollection()}>
              <Plus className="w-4 h-4 mr-2" />
              {t.contextMenu.createNewCollection}
            </ContextMenuItem>
            <ContextMenuSeparator />
            {collectionMenu.isLoading ? (
              <ContextMenuItem disabled>{t.collection.loading}</ContextMenuItem>
            ) : collectionMenu.collections.length === 0 ? (
              <ContextMenuItem disabled>{t.contextMenu.noCollectionsAvailable}</ContextMenuItem>
            ) : (
              <CollectionMenuItems
                items={collectionMenu.collections}
                onAddToCollection={collectionMenu.onAddToCollection}
              />
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : null}
      {onMergeSelected ? (
        <ContextMenuItem onClick={() => void onMergeSelected()}>
          <GitMerge className="w-4 h-4 mr-2" />
          {t.grid.mergeStacks}
        </ContextMenuItem>
      ) : null}

      {(hasPrimaryActions || hasSecondaryActions) && hasDestructiveActions ? (
        <ContextMenuSeparator />
      ) : null}

      {onRemoveLike ? (
        <ContextMenuItem
          onClick={() => void onRemoveLike()}
          className="text-red-600 focus:text-red-700"
        >
          <HeartOff className="w-4 h-4 mr-2" />
          {t.viewerControls.unlike}
        </ContextMenuItem>
      ) : null}
      {onRemoveFromCollection ? (
        <ContextMenuItem
          onClick={() => void onRemoveFromCollection()}
          className="text-red-600 focus:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t.contextMenu.removeFromCollection}
        </ContextMenuItem>
      ) : null}
      {onRemoveFromScratch ? (
        <ContextMenuItem
          onClick={() => void onRemoveFromScratch()}
          className="text-red-600 focus:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t.contextMenu.removeFromScratch}
        </ContextMenuItem>
      ) : null}
      {onRemoveStack ? (
        <ContextMenuItem
          onClick={() => void onRemoveStack()}
          className="text-red-600 focus:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {deleteLabel}
        </ContextMenuItem>
      ) : null}
    </ContextMenuContent>
  );
}
