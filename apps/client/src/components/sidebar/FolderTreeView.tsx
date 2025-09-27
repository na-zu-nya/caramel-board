import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SideMenuMessage } from '@/components/ui/SideMenu';
import { CountBadge } from '@/components/ui/SideMenu/CountBadge';
import { isScratchCollection } from '@/hooks/useScratch';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Collection, CollectionFolder, FolderTreeNode } from '@/types';
import { CollectionDropItem } from './CollectionDropItem';

interface FolderTreeViewProps {
  folders: CollectionFolder[];
  rootCollections: Collection[];
  isPinned: (type: 'COLLECTION', id: number) => boolean;
  onCollectionUpdate: () => void;
  onCollectionDelete: () => void;
  onCollectionPin: (collection: Collection, iconName: string, name: string) => void;
  onCollectionUnpin: (collection: Collection) => void;
  onStackAdded: () => void;
}

interface DragData {
  id: string;
  type: 'folder' | 'collection';
  item: CollectionFolder | Collection;
}

// LocalStorage keys for folder expansion state
const FOLDER_EXPANDED_STATE_KEY = 'folder-expanded-state';

// Load expansion state from localStorage
function loadExpandedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(FOLDER_EXPANDED_STATE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

// Save expansion state to localStorage
function saveExpandedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(FOLDER_EXPANDED_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage errors
  }
}

export function FolderTreeView({
  folders,
  rootCollections,
  isPinned,
  onCollectionUpdate,
  onCollectionDelete,
  onCollectionPin,
  onCollectionUnpin,
  onStackAdded,
}: FolderTreeViewProps) {
  const [expandedFolders, setExpandedFolders] =
    useState<Record<string, boolean>>(loadExpandedState);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragData, setDragData] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Toggle folder expansion
  const toggleFolder = (folderId: number) => {
    const newState = {
      ...expandedFolders,
      [folderId]: !expandedFolders[folderId],
    };
    setExpandedFolders(newState);
    saveExpandedState(newState);
  };

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveExpandedState(expandedFolders);
  }, [expandedFolders]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const [type, id] = (active.id as string).split('-');

    setActiveId(active.id as string);

    let item: CollectionFolder | Collection | undefined;
    if (type === 'folder') {
      item = findFolderById(folders, Number.parseInt(id));
    } else {
      item =
        rootCollections.find((c) => c.id === Number.parseInt(id)) ||
        findCollectionInFolders(folders, Number.parseInt(id));
    }

    if (item) {
      setDragData({
        id: active.id as string,
        type: type as 'folder' | 'collection',
        item,
      });
    }
  };

  // Handle drag over (for visual feedback)
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    // Auto-expand folders when dragging over them
    const [overType, overId] = (over.id as string).split('-');
    if (overType === 'folder') {
      const folderId = Number.parseInt(overId);
      if (!expandedFolders[folderId]) {
        setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
      }
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const [activeType, activeId] = (active.id as string).split('-');
    const overIdStr = String(over.id);
    const [overType, overId] = overIdStr.includes('-')
      ? (overIdStr.split('-') as [string, string])
      : ([overIdStr, ''] as [string, string]);

    try {
      if (activeType === 'collection') {
        // Move collection into a folder or extract to root
        const isRootDrop =
          overType === 'root' || overIdStr === 'root-edge-top' || overIdStr === 'root-edge-bottom';
        const newFolderId = isRootDrop
          ? null
          : overType === 'folder'
            ? Number.parseInt(overId)
            : null;
        await apiClient.updateCollection(Number.parseInt(activeId), { folderId: newFolderId });
      } else if (activeType === 'folder') {
        const sourceFolderId = Number.parseInt(activeId);
        const isRootDrop =
          overType === 'root' || overIdStr === 'root-edge-top' || overIdStr === 'root-edge-bottom';
        const targetIsFolder = overType === 'folder';
        const newParentId = isRootDrop
          ? undefined
          : targetIsFolder
            ? Number.parseInt(overId)
            : undefined; // folder or root

        // Prevent moving folder into itself or its children
        if (newParentId && isDescendant(newParentId, sourceFolderId)) {
          console.warn('Cannot move folder into itself or its children');
          return;
        }

        // Only two behaviors: put into folder or move to root
        if (!isRootDrop && targetIsFolder) {
          await apiClient.moveCollectionFolder(sourceFolderId, newParentId);
        } else {
          await apiClient.moveCollectionFolder(sourceFolderId, undefined);
        }
      }

      // Refresh the tree
      onCollectionUpdate();
    } catch (error) {
      console.error('Failed to move item:', error);
    }

    // Clear drag state after processing to avoid snap-back visuals
    setActiveId(null);
    setDragData(null);
  };

  // Helper function to find folder by ID
  const findFolderById = (
    folders: CollectionFolder[],
    id: number
  ): CollectionFolder | undefined => {
    for (const folder of folders) {
      if (folder.id === id) return folder;
      if (folder.children) {
        const found = findFolderById(folder.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  // Helper function to find collection in folders
  const findCollectionInFolders = (
    folders: CollectionFolder[],
    id: number
  ): Collection | undefined => {
    for (const folder of folders) {
      if (folder.collections) {
        const found = folder.collections.find((c) => c.id === id);
        if (found) return found;
      }
      if (folder.children) {
        const found = findCollectionInFolders(folder.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  // Helper function to check if target is descendant of source
  const isDescendant = (targetId: number, sourceId: number): boolean => {
    const checkFolder = (folder: CollectionFolder): boolean => {
      if (folder.id === targetId) return true;
      return folder.children?.some(checkFolder) || false;
    };

    const sourceFolder = findFolderById(folders, sourceId);
    return sourceFolder ? checkFolder(sourceFolder) : false;
  };

  // Convert folder hierarchy to tree nodes for rendering
  const buildTreeNodes = (
    folders: CollectionFolder[],
    collections: Collection[] = [],
    level = 0
  ): FolderTreeNode[] => {
    const nodes: FolderTreeNode[] = [];

    // Add folders first
    for (const folder of folders) {
      const isExpanded = expandedFolders[folder.id] ?? false;
      const folderNode: FolderTreeNode = {
        type: 'folder',
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        description: folder.description,
        isExpanded,
        level,
        folder,
        _count: folder._count,
        children: [],
      };

      // Add child folders if expanded
      if (isExpanded && folder.children && folder.children.length > 0) {
        folderNode.children = buildTreeNodes(folder.children, [], level + 1);
      }

      // Add folder collections at the same level if expanded
      if (isExpanded && folder.collections && folder.collections.length > 0) {
        const visibleCollections = folder.collections.filter((c) => !isScratchCollection(c));
        const collectionNodes = visibleCollections.map(
          (collection): FolderTreeNode => ({
            type: 'collection',
            id: collection.id,
            name: collection.name,
            icon: collection.icon,
            description: collection.description,
            level: level + 1,
            collection,
            _count: collection._count,
          })
        );

        if (folderNode.children) {
          folderNode.children.push(...collectionNodes);
        } else {
          folderNode.children = collectionNodes;
        }
      }

      nodes.push(folderNode);
    }

    // Add root collections (not in folders)
    const visibleRootCollections = collections.filter((c) => !isScratchCollection(c));
    const collectionNodes = visibleRootCollections.map(
      (collection): FolderTreeNode => ({
        type: 'collection',
        id: collection.id,
        name: collection.name,
        icon: collection.icon,
        description: collection.description,
        level,
        collection,
        _count: collection._count,
      })
    );

    nodes.push(...collectionNodes);

    return nodes;
  };

  // Draggable folder component (no sortable/reorder illusion)
  const DraggableFolderNode = ({ node }: { node: FolderTreeNode }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: `folder-${node.id}`,
      data: {
        type: 'folder',
        item: node.folder,
      },
    });

    const style: React.CSSProperties = {
      // Keep original in place; use overlay for movement
      opacity: isDragging ? 0 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <button
          type="button"
          onClick={() => toggleFolder(node.id)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700 rounded hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing'
          )}
          style={{ paddingLeft: `${0.5 + node.level * 1.25}rem` }}
        >
          {node.isExpanded ? (
            <ChevronDown size={12} className="text-gray-500" />
          ) : (
            <ChevronRight size={12} className="text-gray-500" />
          )}
          {node.isExpanded ? (
            <FolderOpen size={15} className="text-blue-500" />
          ) : (
            <Folder size={15} className="text-blue-500" />
          )}
          <span className="flex-1 text-left">{node.name}</span>
          <CountBadge count={node._count?.collections} />
        </button>
      </div>
    );
  };

  // Draggable collection component (no sortable/reorder illusion)
  const DraggableCollectionNode = ({ node }: { node: FolderTreeNode }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: `collection-${node.id}`,
      data: {
        type: 'collection',
        item: node.collection,
      },
    });

    const style: React.CSSProperties = {
      // Keep original in place; use overlay for movement
      opacity: isDragging ? 0 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <div className={cn('cursor-grab active:cursor-grabbing rounded')}>
          <CollectionDropItem
            collection={node.collection!}
            isPinned={isPinned('COLLECTION', node.collection!.id)}
            onUpdate={onCollectionUpdate}
            onDelete={onCollectionDelete}
            onPin={(iconName, name) => onCollectionPin(node.collection!, iconName, name)}
            onUnpin={() => onCollectionUnpin(node.collection!)}
            onStackAdded={onStackAdded}
            level={node.level}
          />
        </div>
      </div>
    );
  };

  // Drop zone component for folders
  const DropZone = ({
    id,
    children,
    folder,
  }: {
    id: string;
    children: React.ReactNode;
    folder?: CollectionFolder;
  }) => {
    const { isOver, setNodeRef } = useDroppable({ id });
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (types.includes('application/json')) {
        setIsDragOver(true);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!folder) return;

      try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;

        const dragData = JSON.parse(data);

        // For now, just log the drop event on folders
        console.log('🟢 Stack dropped on folder:', folder.name, dragData);
      } catch (error) {
        console.error('Failed to process drop on folder:', error);
      }
    };

    const highlight = isOver || isDragOver;

    return (
      <div
        ref={setNodeRef}
        className={cn('transition-colors rounded', highlight && 'bg-blue-50 ring-2 ring-blue-200')}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {children}
      </div>
    );
  };

  // Root drop zone with extra edge bands for easier extraction
  const RootDropZone = ({ children }: { children: React.ReactNode }) => {
    const root = useDroppable({ id: 'root' });
    const [isDragOver, setIsDragOver] = useState(false);
    const edgeTop = useDroppable({ id: 'root-edge-top' });
    const edgeBottom = useDroppable({ id: 'root-edge-bottom' });

    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (types.includes('application/json')) {
        setIsDragOver(true);
      }
    };
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };
    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const highlight = root.isOver || isDragOver || edgeTop.isOver || edgeBottom.isOver;

    return (
      <div
        ref={root.setNodeRef}
        className={cn(
          'transition-colors rounded relative',
          highlight && 'bg-blue-50 ring-2 ring-blue-200'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div ref={edgeTop.setNodeRef} className="absolute top-0 left-0 right-0 h-2" />
        <div ref={edgeBottom.setNodeRef} className="absolute bottom-0 left-0 right-0 h-2" />
        {children}
      </div>
    );
  };

  // Recursive component to render tree nodes
  const TreeNodeComponent = ({ node }: { node: FolderTreeNode }) => {
    if (node.type === 'folder' && node.folder) {
      return (
        <DropZone key={`folder-${node.id}`} id={`folder-${node.id}`} folder={node.folder}>
          <div>
            <DraggableFolderNode node={node} />

            {/* Render children if expanded; included in the same drop zone to enlarge area */}
            {node.isExpanded && node.children && node.children.length > 0 && (
              <div className="space-y-0.5">
                {node.children.map((childNode) => (
                  <TreeNodeComponent key={`${childNode.type}-${childNode.id}`} node={childNode} />
                ))}
              </div>
            )}
          </div>
        </DropZone>
      );
    }

    if (node.type === 'collection' && node.collection) {
      return <DraggableCollectionNode key={`collection-${node.id}`} node={node} />;
    }

    return null;
  };

  const treeNodes = buildTreeNodes(folders, rootCollections);

  if (treeNodes.length === 0) {
    return <SideMenuMessage>No Collections or Folders</SideMenuMessage>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-0.5">
        {/* Root drop zone (highlights entire Collections area when extracting) */}
        <RootDropZone>
          <div className="space-y-0.5">
            {treeNodes.map((node) => (
              <TreeNodeComponent key={`${node.type}-${node.id}`} node={node} />
            ))}
          </div>
        </RootDropZone>
      </div>

      {/* Drag overlay for visual feedback */}
      <DragOverlay dropAnimation={null}>
        {activeId && dragData ? (
          <div className="bg-white shadow-lg rounded-md p-2 border border-gray-200 opacity-90">
            <div className="flex items-center gap-2">
              {dragData.type === 'folder' ? (
                <Folder size={15} className="text-blue-500" />
              ) : (
                <span className="text-sm">{(dragData.item as Collection).icon}</span>
              )}
              <span className="text-sm font-medium">
                {dragData.type === 'folder'
                  ? (dragData.item as CollectionFolder).name
                  : (dragData.item as Collection).name}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
