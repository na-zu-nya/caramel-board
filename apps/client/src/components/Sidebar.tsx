import {CollectionsSection} from '@/components/sidebar/CollectionsSection';
import {DatasetSection} from '@/components/sidebar/DatasetSection';
import {LibrarySection} from '@/components/sidebar/LibrarySection';
import {SettingsSection} from '@/components/sidebar/SettingsSection';
import type {NavigationPinHandlers} from '@/components/sidebar/types';
import {useSwipeClose} from '@/hooks/features/useSwipeClose';
import {apiClient} from '@/lib/api-client';
import {cn} from '@/lib/utils';
import {currentDatasetAtom, sidebarOpenAtom} from '@/stores/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useParams} from '@tanstack/react-router';
import {useAtom} from 'jotai';
import {X} from 'lucide-react';
import {useEffect, useState} from 'react';

// LocalStorage keys for collapsed state
const COLLAPSED_STATE_KEY = 'sidebar-collapsed-groups';

// Load collapsed state from localStorage
function loadCollapsedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(COLLAPSED_STATE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

// Save collapsed state to localStorage
function saveCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore localStorage errors
  }
}

export default function Sidebar() {
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const [currentDataset] = useAtom(currentDatasetAtom);
  // @ts-ignore
  const params = useParams({strict: false});
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const queryClient = useQueryClient();

  // Collapsed state for each group
  const [collapsedGroups, setCollapsedGroups] =
    useState<Record<string, boolean>>(loadCollapsedState);

  // Fetch navigation pins for current dataset
  const {data: navigationPins = []} = useQuery({
    queryKey: ['navigation-pins', datasetId],
    queryFn: async () => {
      return apiClient.getNavigationPinsByDataset(datasetId);
    },
  });

  // Pin mutations
  const createNavigationPinMutation = useMutation({
    mutationFn: async (newPin: Parameters<typeof apiClient.createNavigationPin>[0]) => {
      return apiClient.createNavigationPin(newPin);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['navigation-pins', datasetId]});
    },
  });

  const deleteNavigationPinMutation = useMutation({
    mutationFn: async (pinId: number) => {
      return apiClient.deleteNavigationPin(pinId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['navigation-pins', datasetId]});
    },
  });

  // Toggle group collapsed state
  const toggleGroup = (groupKey: string) => {
    const newState = {
      ...collapsedGroups,
      [groupKey]: !collapsedGroups[groupKey],
    };
    setCollapsedGroups(newState);
    saveCollapsedState(newState);
  };

  // Handle collection creation success
  const handleCollectionCreated = () => {
    queryClient.invalidateQueries({queryKey: ['collection-folders', datasetId]});
  };

  // Handle collection update/delete
  const handleCollectionChanged = () => {
    queryClient.invalidateQueries({queryKey: ['collection-folders', datasetId]});
    // Also invalidate stacks queries to refresh collection membership
    queryClient.invalidateQueries({queryKey: ['stacks']});
  };

  // Pin management functions - implementation of NavigationPinHandlers
  const isPinned: NavigationPinHandlers['isPinned'] = (type, id, mediaType) => {
    return navigationPins.some(
      (pin) =>
        pin.dataSetId === Number.parseInt(datasetId) &&
        pin.type === type &&
        (type === 'COLLECTION'
          ? pin.collectionId === id
          : type === 'MEDIA_TYPE'
            ? pin.mediaType === mediaType
            : type === 'OVERVIEW')
    );
  };

  const handlePinCollection: NavigationPinHandlers['onPinCollection'] = async (
    collection,
    iconName,
    name
  ) => {
    console.log('Pin collection:', {collection, iconName, name});

    const newPin = {
      type: 'COLLECTION' as const,
      dataSetId: Number.parseInt(datasetId),
      name,
      icon: iconName,
      order: navigationPins.length,
      collectionId: collection.id,
    };

    createNavigationPinMutation.mutate(newPin);
  };

  const handleUnpinCollection: NavigationPinHandlers['onUnpinCollection'] = async (collection) => {
    console.log('Unpin collection:', collection);

    // Find the pin to delete
    const pinToDelete = navigationPins.find(
      (pin) =>
        pin.type === 'COLLECTION' &&
        pin.collectionId === collection.id &&
        pin.dataSetId === Number.parseInt(datasetId)
    );

    if (pinToDelete) {
      deleteNavigationPinMutation.mutate(pinToDelete.id);
    }
  };

  const handlePinMediaType: NavigationPinHandlers['onPinMediaType'] = async (
    mediaType,
    iconName,
    name
  ) => {
    console.log('Pin media type:', {mediaType, iconName, name});

    const newPin = {
      type: 'MEDIA_TYPE' as const,
      dataSetId: Number.parseInt(datasetId),
      name,
      icon: iconName,
      order: navigationPins.length,
      mediaType,
    };

    createNavigationPinMutation.mutate(newPin);
  };

  const handleUnpinMediaType: NavigationPinHandlers['onUnpinMediaType'] = async (mediaType) => {
    console.log('Unpin media type:', mediaType);

    // Find the pin to delete
    const pinToDelete = navigationPins.find(
      (pin) =>
        pin.type === 'MEDIA_TYPE' &&
        pin.mediaType === mediaType &&
        pin.dataSetId === Number.parseInt(datasetId)
    );

    if (pinToDelete) {
      deleteNavigationPinMutation.mutate(pinToDelete.id);
    }
  };

  const handlePinOverview: NavigationPinHandlers['onPinOverview'] = async (iconName, name) => {
    console.log('Pin overview:', {iconName, name});

    const newPin = {
      type: 'OVERVIEW' as const,
      dataSetId: Number.parseInt(datasetId),
      name,
      icon: iconName,
      order: navigationPins.length,
    };

    createNavigationPinMutation.mutate(newPin);
  };

  const handleUnpinOverview: NavigationPinHandlers['onUnpinOverview'] = async () => {
    console.log('Unpin overview');

    // Find the pin to delete
    const pinToDelete = navigationPins.find(
      (pin) => pin.type === 'OVERVIEW' && pin.dataSetId === Number.parseInt(datasetId)
    );

    if (pinToDelete) {
      deleteNavigationPinMutation.mutate(pinToDelete.id);
    }
  };

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveCollapsedState(collapsedGroups);
  }, [collapsedGroups]);

  const swipeRef = useSwipeClose<HTMLDivElement>({
    direction: 'left',
    isActive: isOpen,
    onClose: () => setIsOpen(false),
  });

  return (
    <aside
      ref={swipeRef}
      className={cn(
        'fixed top-0 left-0 h-full w-80 bg-white border-r border-gray-200 z-40 transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Caramel Board</h2>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Close sidebar"
        >
          <X size={18} className="text-gray-600"/>
        </button>
      </div>

      {/* Content */}
      <div className="p-2 space-y-3 overflow-y-auto" style={{maxHeight: 'calc(100vh - 64px)'}}>
        {/* Dataset Selection */}
        <DatasetSection
          datasetId={datasetId}
          currentDataset={currentDataset}
          isCollapsed={collapsedGroups.dataset}
          onToggle={() => toggleGroup('dataset')}
        />

        {/* Settings Section */}
        <SettingsSection
          datasetId={datasetId}
          isCollapsed={collapsedGroups.settings}
          onToggle={() => toggleGroup('settings')}
        />

        {/* Library Section */}
        <LibrarySection
          datasetId={datasetId}
          isCollapsed={collapsedGroups.library}
          onToggle={() => toggleGroup('library')}
          isPinned={isPinned}
          onPinMediaType={handlePinMediaType}
          onUnpinMediaType={handleUnpinMediaType}
          onPinOverview={handlePinOverview}
          onUnpinOverview={handleUnpinOverview}
        />

        {/* Collections Section */}
        <CollectionsSection
          datasetId={datasetId}
          isCollapsed={collapsedGroups.collections}
          onToggle={() => toggleGroup('collections')}
          isPinned={isPinned}
          onPinCollection={handlePinCollection}
          onUnpinCollection={handleUnpinCollection}
          onCollectionCreated={handleCollectionCreated}
          onCollectionChanged={handleCollectionChanged}
        />
      </div>
    </aside>
  );
}
