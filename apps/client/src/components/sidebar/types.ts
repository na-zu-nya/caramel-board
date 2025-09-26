import type { MediaType, Pin } from '@/types';

// Common props for all sidebar sections
export interface SidebarSectionProps {
  datasetId: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

// Navigation pin related functions
export interface NavigationPinHandlers {
  isPinned: (
    type: 'COLLECTION' | 'MEDIA_TYPE' | 'OVERVIEW',
    id?: number,
    mediaType?: MediaType
  ) => boolean;
  onPinCollection: (collection: { id: number }, iconName: string, name: string) => void;
  onUnpinCollection: (collection: { id: number }) => void;
  onPinMediaType: (mediaType: MediaType, iconName: string, name: string) => void;
  onUnpinMediaType: (mediaType: MediaType) => void;
  onPinOverview: (iconName: string, name: string) => void;
  onUnpinOverview: () => void;
}

// Settings section props
export interface SettingsSectionProps extends SidebarSectionProps {}

// Library section props
export interface LibrarySectionProps extends SidebarSectionProps {
  isPinned: NavigationPinHandlers['isPinned'];
  onPinMediaType: NavigationPinHandlers['onPinMediaType'];
  onUnpinMediaType: NavigationPinHandlers['onUnpinMediaType'];
  onPinOverview: NavigationPinHandlers['onPinOverview'];
  onUnpinOverview: NavigationPinHandlers['onUnpinOverview'];
}

// Collections section props
export interface CollectionsSectionProps extends SidebarSectionProps {
  isPinned: NavigationPinHandlers['isPinned'];
  onPinCollection: NavigationPinHandlers['onPinCollection'];
  onUnpinCollection: NavigationPinHandlers['onUnpinCollection'];
  onCollectionCreated: () => void;
  onCollectionChanged: () => void;
}
