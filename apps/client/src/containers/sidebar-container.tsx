import { CollectionsSection } from '@/components/sidebar/CollectionsSection';
import { DatasetSection } from '@/components/sidebar/DatasetSection';
import { LibrarySection } from '@/components/sidebar/LibrarySection';
import { SettingsSection } from '@/components/sidebar/SettingsSection';
import type { NavigationPinHandlers } from '@/components/sidebar/types';
import { SideMenu } from '@/components/ui/SideMenu';
import { apiClient } from '@/lib/api-client';
import { currentDatasetAtom, sidebarOpenAtom } from '@/stores/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

// LocalStorage keys for collapsed state
const COLLAPSED_STATE_KEY = 'sidebar-collapsed-groups';

function loadCollapsedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(COLLAPSED_STATE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function SidebarContainer() {
  const [isOpen, setIsOpen] = useAtom(sidebarOpenAtom);
  const [currentDataset] = useAtom(currentDatasetAtom);
  // @ts-ignore
  const params = useParams({ strict: false });
  const datasetId = (params as { datasetId?: string }).datasetId || currentDataset || '1';
  const queryClient = useQueryClient();

  const [collapsedGroups, setCollapsedGroups] =
    useState<Record<string, boolean>>(loadCollapsedState);

  const { data: navigationPins = [] } = useQuery({
    queryKey: ['navigation-pins', datasetId],
    queryFn: async () => apiClient.getNavigationPinsByDataset(datasetId),
  });

  const createNavigationPinMutation = useMutation({
    mutationFn: async (newPin: Parameters<typeof apiClient.createNavigationPin>[0]) =>
      apiClient.createNavigationPin(newPin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] }),
  });

  const deleteNavigationPinMutation = useMutation({
    mutationFn: async (pinId: number) => apiClient.deleteNavigationPin(pinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['navigation-pins', datasetId] }),
  });

  const toggleGroup = (groupKey: string) => {
    const newState = { ...collapsedGroups, [groupKey]: !collapsedGroups[groupKey] };
    setCollapsedGroups(newState);
    saveCollapsedState(newState);
  };

  const handleCollectionCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['collection-folders', datasetId] });
  };

  const handleCollectionChanged = () => {
    queryClient.invalidateQueries({ queryKey: ['collection-folders', datasetId] });
    queryClient.invalidateQueries({ queryKey: ['collection-stacks'] });
    queryClient.invalidateQueries({ queryKey: ['stacks'] });
  };

  const isPinned: NavigationPinHandlers['isPinned'] = (type, id, mediaType) =>
    navigationPins.some(
      (pin) =>
        pin.dataSetId === Number.parseInt(datasetId) &&
        pin.type === type &&
        (type === 'COLLECTION'
          ? pin.collectionId === id
          : type === 'MEDIA_TYPE'
            ? pin.mediaType === mediaType
            : type === 'OVERVIEW')
    );

  const handlePinCollection: NavigationPinHandlers['onPinCollection'] = async (
    collection,
    iconName,
    name
  ) => {
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
    const pinToDelete = navigationPins.find(
      (pin) =>
        pin.type === 'COLLECTION' &&
        pin.collectionId === collection.id &&
        pin.dataSetId === Number.parseInt(datasetId)
    );
    if (pinToDelete) deleteNavigationPinMutation.mutate(pinToDelete.id);
  };

  const handlePinMediaType: NavigationPinHandlers['onPinMediaType'] = async (
    mediaType,
    iconName,
    name
  ) => {
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
    const pinToDelete = navigationPins.find(
      (pin) =>
        pin.type === 'MEDIA_TYPE' &&
        pin.mediaType === mediaType &&
        pin.dataSetId === Number.parseInt(datasetId)
    );
    if (pinToDelete) deleteNavigationPinMutation.mutate(pinToDelete.id);
  };

  const handlePinOverview: NavigationPinHandlers['onPinOverview'] = async (iconName, name) => {
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
    const pinToDelete = navigationPins.find(
      (pin) => pin.type === 'OVERVIEW' && pin.dataSetId === Number.parseInt(datasetId)
    );
    if (pinToDelete) deleteNavigationPinMutation.mutate(pinToDelete.id);
  };

  useEffect(() => {
    saveCollapsedState(collapsedGroups);
  }, [collapsedGroups]);

  const menuTitle = (
    <Link
      to="/"
      className="inline-flex items-center rounded-sm text-gray-900 no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white hover:text-primary-strong"
    >
      Caramel Board
    </Link>
  );

  return (
    <SideMenu open={isOpen} onClose={() => setIsOpen(false)} title={menuTitle}>
      <DatasetSection
        datasetId={datasetId}
        currentDataset={currentDataset}
        isCollapsed={collapsedGroups.dataset}
        onToggle={() => toggleGroup('dataset')}
      />

      <SettingsSection
        datasetId={datasetId}
        isCollapsed={collapsedGroups.settings}
        onToggle={() => toggleGroup('settings')}
      />

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
    </SideMenu>
  );
}
