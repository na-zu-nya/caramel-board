import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { useDatasets } from '@/hooks/useDatasets';
import { apiClient } from '@/lib/api-client';
import { isScratchCollection } from '@/hooks/useScratch';
import { cn } from '@/lib/utils';
import {
  currentDatasetAtom,
  filterOpenAtom,
  hasActiveFiltersAtom,
  headerActionsAtom,
  infoSidebarOpenAtom,
  reorderModeAtom,
  selectionModeAtom,
  sidebarOpenAtom,
} from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { ArrowUpDown, Check, ChevronDown, Filter, Menu, Shuffle } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Header() {
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [currentDataset] = useAtom(currentDatasetAtom);
  const [filterOpen, setFilterOpen] = useAtom(filterOpenAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [reorderMode, setReorderMode] = useAtom(reorderModeAtom);
  const [headerActions] = useAtom(headerActionsAtom);
  const [hasActiveFilters] = useAtom(hasActiveFiltersAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const { data: datasets = [] } = useDatasets();
  const navigate = useNavigate();
  const location = useLocation();

  const params = useParams({ strict: false });
  const datasetId = (params as any).datasetId || currentDataset || '1';
  const selectedDataset = datasets.find((d) => String(d.id) === String(datasetId));

  // Fetch stack pins for current dataset
  // Fetch navigation pins for current dataset
  const { data: navigationPins = [] } = useQuery({
    queryKey: ['navigation-pins', datasetId],
    queryFn: async () => {
      return apiClient.getNavigationPinsByDataset(datasetId);
    },
  });

  // Helper function to render Lucide icons dynamically
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent size={18} />;
    }
    return <LucideIcons.Bookmark size={18} />; // Fallback icon
  };

  // Check if a navigation pin is active
  const isNavigationPinActive = (pin: any) => {
    const path = location.pathname;
    if (pin.type === 'COLLECTION' && pin.collectionId) {
      const scratch = (pin.collection && isScratchCollection(pin.collection)) || pin.name === 'Scratch';
      return scratch
        ? path.includes(`/scratch/${pin.collectionId}`)
        : path.includes(`/collections/${pin.collectionId}`);
    } else if (pin.type === 'MEDIA_TYPE' && pin.mediaType) {
      return path.includes(`/media-type/${pin.mediaType}`);
    } else if (pin.type === 'OVERVIEW') {
      return path === `/library/${datasetId}`;
    } else if (pin.type === 'FAVORITES') {
      return path === `/library/${datasetId}/favorites`;
    } else if (pin.type === 'LIKES') {
      return path === `/library/${datasetId}/likes`;
    }
    return false;
  };

  // Handle navigation pin navigation
  const handleNavigationPinClick = (pin: any) => {
    if (pin.type === 'COLLECTION' && pin.collectionId) {
      // Scratch pins are stored as COLLECTION type; detect and route to scratch page
      const isScratch = (pin.collection && isScratchCollection(pin.collection)) || pin.name === 'Scratch';
      if (isScratch) {
        navigate({ to: '/library/$datasetId/scratch/$scratchId', params: { datasetId, scratchId: String(pin.collectionId) } });
      } else {
        navigate({
          to: '/library/$datasetId/collections/$collectionId',
          params: () => ({ datasetId, collectionId: String(pin.collectionId) }),
        });
      }
    } else if (pin.type === 'MEDIA_TYPE' && pin.mediaType) {
      // Navigate to media type
      navigate({ to: `/library/${datasetId}/media-type/${pin.mediaType}` });
    } else if (pin.type === 'OVERVIEW') {
      // Navigate to overview
      navigate({ to: `/library/${datasetId}` });
    } else if (pin.type === 'FAVORITES') {
      // Navigate to favorites
      navigate({ to: `/library/${datasetId}/favorites` });
    } else if (pin.type === 'LIKES') {
      // Navigate to likes
      navigate({ to: `/library/${datasetId}/likes` });
    }
  };

  // State for responsive mode
  const [isCompactMode, setIsCompactMode] = useState(false);

  // Check if we need to use compact mode
  useEffect(() => {
    const checkCompactMode = () => {
      // Calculate total width needed for pins
      const totalPins = navigationPins.length;
      const estimatedWidth = totalPins * 100 + 200; // Rough estimate
      const availableWidth = window.innerWidth;

      // Switch to compact mode if not enough space
      setIsCompactMode(availableWidth < 768 || estimatedWidth > availableWidth * 0.6);
    };

    checkCompactMode();
    window.addEventListener('resize', checkCompactMode);
    return () => window.removeEventListener('resize', checkCompactMode);
  }, [navigationPins.length]);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-50 backdrop-blur supports-[backdrop-filter]:backdrop-blur text-white transition-all duration-300 ease-in-out',
        sidebarOpen ? 'left-80' : 'left-0'
      )}
      style={{
        backgroundColor: selectedDataset?.themeColor
          ? `color-mix(in oklch, ${selectedDataset.themeColor} 80%, transparent)`
          : 'rgba(255, 255, 255, 0.8)',
      }}
    >
      {/* Main header */}
      <div className="px-4 h-14 flex items-center relative">
        {/* Left section */}
        <div className="flex items-center gap-2">
          <HeaderIconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            isActive={sidebarOpen}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            <Menu size={18} />
          </HeaderIconButton>
          {headerActions.showShuffle && (
            <HeaderIconButton aria-label="Shuffle" onClick={headerActions.onShuffle ?? undefined}>
              <Shuffle size={18} />
            </HeaderIconButton>
          )}
        </div>

        {/* Center section - Pinned items (absolutely positioned) */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
          {isCompactMode && navigationPins.length > 0 ? (
            /* Compact mode - Dropdown menu */
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
                  <span>Pins</span>
                  <ChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[200px]">
                {/* Navigation pins in dropdown */}
                {navigationPins.map((pin) => (
                  <DropdownMenuItem
                    key={pin.id}
                    onClick={() => handleNavigationPinClick(pin)}
                    className={cn(
                      'flex items-center gap-2',
                      isNavigationPinActive(pin) && 'bg-gray-100'
                    )}
                  >
                    {renderIcon(pin.icon)}
                    <span>{pin.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /* Normal mode - Show pins inline */
            <>
              {/* Navigation pins */}
              {navigationPins.length > 0 && (
                <div className="flex items-center gap-2">
                  {navigationPins.map((pin) => (
                    <HeaderIconButton
                      key={pin.id}
                      onClick={() => handleNavigationPinClick(pin)}
                      title={pin.name}
                      isActive={isNavigationPinActive(pin)}
                    >
                      {renderIcon(pin.icon)}
                    </HeaderIconButton>
                  ))}
                </div>
              )}

              {/* Separator */}
              {/* No pins message */}
              {navigationPins.length === 0 && (
                <span className="text-sm text-white/50">No pinned items</span>
              )}
            </>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Filter button - moved to leftmost position */}
          {headerActions.showFilter && (
            <HeaderIconButton
              onClick={() => !selectionMode && setFilterOpen(!filterOpen)}
              disabled={selectionMode}
              isActive={filterOpen}
              badge={hasActiveFilters && !selectionMode}
              badgeColor="primary"
              className={selectionMode ? 'opacity-50 cursor-not-allowed' : ''}
              aria-label={
                selectionMode
                  ? 'Filter disabled during selection'
                  : filterOpen
                    ? 'Close filter'
                    : 'Open filter'
              }
            >
              <Filter size={18} />
            </HeaderIconButton>
          )}

          {/* Reorder mode button - only in collection views */}
          {headerActions.showReorder && (
            <HeaderIconButton
              onClick={() => {
                // Turn off selection mode when entering reorder mode
                if (!reorderMode && selectionMode) {
                  setSelectionMode(false);
                }
                setReorderMode(!reorderMode);
              }}
              disabled={selectionMode}
              isActive={reorderMode}
              className={selectionMode ? 'opacity-50 cursor-not-allowed' : ''}
              aria-label={
                selectionMode
                  ? 'Reorder disabled during selection'
                  : reorderMode
                    ? 'Exit reorder mode'
                    : 'Enter reorder mode'
              }
            >
              <ArrowUpDown size={18} />
            </HeaderIconButton>
          )}

          {/* Selection mode button */}
          {headerActions.showSelection && (
            <HeaderIconButton
              onClick={() => {
                // Turn off reorder mode when entering selection mode
                if (!selectionMode && reorderMode) {
                  setReorderMode(false);
                }
                // If turning on selection mode, turn off info sidebar
                if (!selectionMode && infoSidebarOpen) {
                  setInfoSidebarOpen(false);
                }
                setSelectionMode(!selectionMode);
              }}
              disabled={reorderMode}
              isActive={selectionMode}
              className={reorderMode ? 'opacity-50 cursor-not-allowed' : ''}
              aria-label={
                reorderMode
                  ? 'Selection disabled during reorder'
                  : selectionMode
                    ? 'Exit selection mode'
                    : 'Enter selection mode'
              }
            >
              <Check size={18} />
            </HeaderIconButton>
          )}

          {/* Portal target for page-specific actions */}
          <div id="header-actions" className="flex items-center gap-2" />
        </div>
      </div>
    </header>
  );
}
