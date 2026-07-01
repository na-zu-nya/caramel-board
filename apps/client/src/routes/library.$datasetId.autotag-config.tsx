import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import {
  ArrowRight,
  Check,
  Edit2,
  Filter,
  Info,
  Loader2,
  Plus,
  SquarePen,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BulkEditPanel, { type EditUpdates } from '@/components/BulkEditPanel';
import FilterPanel from '@/components/FilterPanel';
import InfoSidebar from '@/components/InfoSidebar';
import AutoTagMappingModal from '@/components/modals/AutoTagMappingModal';
import { StackTileGrid } from '@/components/StackTileGrid';
import { AutoTagDisplay } from '@/components/ui/autotag-display';
import { Button } from '@/components/ui/button';
import { SmallSearchField, SmallSelect } from '@/components/ui/Controls';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { JoyTagStatus } from '@/components/ui/JoyTagStatus';
import { SelectItem } from '@/components/ui/select';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useRightPanelPushesContent } from '@/hooks/useSidebarLayoutMode';
import { useStackTile } from '@/hooks/useStackTile';
import { useKeyboardShortcuts } from '@/hooks/utils/useKeyboardShortcut';
import { apiClient } from '@/lib/api-client';
import { downloadStackOriginals } from '@/lib/download-originals';
import { useT } from '@/lib/i18n';
import { createStackSelectionActions } from '@/lib/stack-selection-actions';
import { cn } from '@/lib/utils';
import {
  currentFilterAtom,
  filterOpenAtom,
  infoSidebarOpenAtom,
  selectionModeAtom,
} from '@/stores/ui';
import type { JoyTagHealthResponse, Stack, StackFilter } from '@/types';

export const Route = createFileRoute('/library/$datasetId/autotag-config')({
  component: AutoTagConfigPage,
});

interface AutoTagStatistic {
  autoTagKey: string;
  predictionCount: number;
  assetCount: number;
}

interface AutoTagStatisticsResponse {
  datasetId: number;
  threshold: number;
  totalTags: number;
  totalPredictions?: number;
  method?: 'sql' | 'aggregate' | 'batch';
  tags: AutoTagStatistic[];
}

interface AutoTagMapping {
  id: number;
  autoTagKey: string;
  tagId?: number;
  displayName: string;
  description?: string;
  isActive: boolean;
  dataSetId: number;
  createdAt: string;
  updatedAt: string;
  tag?: {
    id: number;
    title: string;
  };
}

interface AutoTagMappingsResponse {
  mappings: AutoTagMapping[];
  total: number;
  limit: number;
  offset: number;
}

type AutoTagStack = Stack & {
  _count?: {
    assets?: number;
  };
};

interface AutoTagStackPage {
  stacks: AutoTagStack[];
  total: number;
  limit: number;
  offset: number;
}

function AutoTagConfigPage() {
  const t = useT();
  const { datasetId } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    onOpen,
    onFindSimilar,
    onAddToScratch,
    onDownload,
    onToggleFavorite,
    onLike,
    onInfo,
    dragProps,
  } = useStackTile(datasetId);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedAutoTag, setSelectedAutoTag] = useState<string | null>(null);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<AutoTagMapping | null>(null);
  const [mappingAutoTagKey, setMappingAutoTagKey] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'count-desc' | 'count-asc'>(
    'count-desc'
  );
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const rightPanelPushesContent = useRightPanelPushesContent(
    (!selectionMode && infoSidebarOpen) || (selectionMode && isEditPanelOpen)
  );
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterOpen, setFilterOpen] = useAtom(filterOpenAtom);
  const [_currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [localFilter, setLocalFilter] = useState<StackFilter>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  // Strict (raw) counts fetched lazily for visible tags
  const [strictCounts, setStrictCounts] = useState<
    Record<string, { predictionCount: number; assetCount: number }>
  >({});
  const requestedStrictKeysRef = useRef<Set<string>>(new Set());
  const listItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const pendingVisibleKeysRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Fetch AutoTag statistics with server-side search
  const {
    data: statisticsData,
    isLoading: statisticsLoading,
    error: statisticsError,
  } = useQuery<AutoTagStatisticsResponse>({
    queryKey: ['autotag-statistics', datasetId, debouncedSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '200',
        q: debouncedSearchQuery || '',
        threshold: '0.4',
        source: 'aggregate',
        includeTotal: 'false',
      });
      const response = await apiClient.get(
        `/api/v1/auto-tags/statistics/${datasetId}?${params.toString()}`
      );
      return response.data;
    },
  });

  const {
    data: joyTagHealth,
    isLoading: joyTagHealthLoading,
    isFetching: joyTagHealthFetching,
  } = useQuery<JoyTagHealthResponse>({
    queryKey: ['joytag-health'],
    queryFn: () => apiClient.getJoyTagHealth(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const joyTagStatusComputed = useMemo(() => {
    const payload = joyTagHealth?.joytag;
    if (payload?.status === 'ok') {
      return {
        status: 'running' as const,
        message: payload.device ? t.autoTagPage.device(payload.device) : undefined,
      };
    }

    const fallbackMessage =
      joyTagHealth?.message ?? (payload?.status ? `status: ${payload.status}` : undefined);

    return {
      status: 'not-available' as const,
      message: fallbackMessage,
    };
  }, [joyTagHealth, t]);

  const joyTagStatusLoading = joyTagHealthLoading || joyTagHealthFetching;

  // Sort statistics (placed early to avoid TDZ in effects below)
  const filteredStatistics = useMemo(() => {
    if (!statisticsData?.tags) return [] as AutoTagStatistic[];

    const sorted = [...statisticsData.tags];
    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.autoTagKey.localeCompare(b.autoTagKey));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.autoTagKey.localeCompare(a.autoTagKey));
        break;
      case 'count-desc':
        sorted.sort((a, b) => b.predictionCount - a.predictionCount);
        break;
      case 'count-asc':
        sorted.sort((a, b) => a.predictionCount - b.predictionCount);
        break;
    }

    return sorted;
  }, [statisticsData?.tags, sortBy]);

  // Reset strict counts cache when dataset or search changes
  useEffect(() => {
    setStrictCounts({});
    requestedStrictKeysRef.current = new Set();
    pendingVisibleKeysRef.current = new Set();
  }, []);

  // Lazily fetch strict counts for currently listed tags (top N)
  useEffect(() => {
    if (!statisticsData?.tags || statisticsData?.method !== 'aggregate') return;
    const allKeys = filteredStatistics.map((t) => t.autoTagKey);
    if (allKeys.length === 0) return;

    const TOP_N = 100;
    const BATCH = 25;
    const target = allKeys.slice(0, TOP_N);
    const missing = target.filter(
      (k) => !strictCounts[k] && !requestedStrictKeysRef.current.has(k)
    );
    if (missing.length === 0) return;

    // Mark as requested to avoid duplicate calls
    for (const k of missing) {
      requestedStrictKeysRef.current.add(k);
    }

    const run = async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const params = new URLSearchParams({ threshold: '0.4' });
        for (const k of batch) {
          params.append('keys', k);
        }
        try {
          const res = await apiClient.get(
            `/api/v1/auto-tags/statistics/${datasetId}/strict?${params.toString()}`
          );
          const items = res.data?.tags as Array<{
            autoTagKey: string;
            predictionCount: number;
            assetCount: number;
          }>;
          if (Array.isArray(items)) {
            setStrictCounts((prev) => {
              const next = { ...prev };
              for (const it of items) {
                next[it.autoTagKey] = {
                  predictionCount: it.predictionCount,
                  assetCount: it.assetCount,
                };
              }
              return next;
            });
          }
        } catch (e) {
          // Ignore batch error; allow others to proceed
          console.warn('Failed to fetch strict counts batch', e);
        }
      }
    };

    run();
  }, [datasetId, filteredStatistics, statisticsData?.method, statisticsData?.tags, strictCounts]);

  // Observe visible rows and request strict counts for them in small batches
  useEffect(() => {
    if (!statisticsData?.tags || statisticsData?.method !== 'aggregate') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newlyVisible: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLDivElement;
          const key = el.getAttribute('data-autotag-key');
          if (!key) continue;
          if (strictCounts[key] || requestedStrictKeysRef.current.has(key)) continue;
          pendingVisibleKeysRef.current.add(key);
          newlyVisible.push(key);
        }

        if (newlyVisible.length > 0) {
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
          flushTimerRef.current = setTimeout(async () => {
            const keys = Array.from(pendingVisibleKeysRef.current);
            pendingVisibleKeysRef.current.clear();
            if (keys.length === 0) return;

            const BATCH = 25;
            for (let i = 0; i < keys.length; i += BATCH) {
              const batch = keys.slice(i, i + BATCH);
              for (const k of batch) {
                requestedStrictKeysRef.current.add(k);
              }
              const params = new URLSearchParams({ threshold: '0.4' });
              for (const k of batch) {
                params.append('keys', k);
              }
              try {
                const res = await apiClient.get(
                  `/api/v1/auto-tags/statistics/${datasetId}/strict?${params.toString()}`
                );
                const items = res.data?.tags as Array<{
                  autoTagKey: string;
                  predictionCount: number;
                  assetCount: number;
                }>;
                if (Array.isArray(items)) {
                  setStrictCounts((prev) => {
                    const next = { ...prev };
                    for (const it of items) {
                      next[it.autoTagKey] = {
                        predictionCount: it.predictionCount,
                        assetCount: it.assetCount,
                      };
                    }
                    return next;
                  });
                }
              } catch (e) {
                console.warn('Failed to fetch strict counts (visible batch)', e);
              }
            }
          }, 200);
        }
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 }
    );

    // Start observing current items
    for (const stat of filteredStatistics) {
      const el = listItemRefs.current.get(stat.autoTagKey);
      if (el) observer.observe(el);
    }

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      observer.disconnect();
    };
  }, [filteredStatistics, statisticsData?.method, strictCounts, datasetId, statisticsData?.tags]);

  // Fetch AutoTag mappings
  const { data: mappingsData } = useQuery<AutoTagMappingsResponse>({
    queryKey: ['autotag-mappings', datasetId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/v1/auto-tags/mappings/${datasetId}?limit=200&offset=0`
      );
      return response.data;
    },
  });

  // Fetch stacks with selected AutoTag using infinite query
  const {
    data: autoTagStacksData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: stacksLoading,
    refetch: refetchAutoTagStacks,
  } = useInfiniteQuery<AutoTagStackPage>({
    queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
    queryFn: async ({ pageParam = 0 }) => {
      if (!selectedAutoTag) {
        return { stacks: [], total: 0, limit: 50, offset: 0 } satisfies AutoTagStackPage;
      }

      const numericOffset = typeof pageParam === 'number' ? pageParam : Number(pageParam) || 0;
      const params = new URLSearchParams({
        autoTag: selectedAutoTag,
        dataSetId: datasetId,
        limit: '50',
        offset: numericOffset.toString(),
      });
      appendFilterParams(params, localFilter);

      const response = await apiClient.get<AutoTagStackPage>(
        `/api/v1/stacks/search/autotag?${params.toString()}`
      );
      return response.data;
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: Boolean(selectedAutoTag),
    initialPageParam: 0,
  });

  // Flatten all stacks from pages
  const allStacks = useMemo<AutoTagStack[]>(() => {
    if (!autoTagStacksData?.pages) return [];
    return autoTagStacksData.pages.flatMap((page) => page.stacks);
  }, [autoTagStacksData]);

  const selectedStackSummaries = useMemo(
    () =>
      allStacks
        .filter((stack) => selectedItems.has(stack.id))
        .map((stack) => ({
          id: stack.id,
          tags: normalizeStackTags(stack.tags),
          author: getStackAuthor(stack.author),
        })),
    [allStacks, selectedItems]
  );
  const selectedStackIds = useMemo(
    () =>
      Array.from(selectedItems)
        .map((id) => toNumericId(id))
        .filter((id): id is number => id !== null),
    [selectedItems]
  );

  // Restore selectedAutoTag from URL when navigation changes
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const k = sp.get('autoTag');
      if (k) {
        const decoded = decodeURIComponent(k);
        setSelectedAutoTag(decoded);
      }
      if (!k) setSelectedAutoTag(null);
    } catch {}
  }, [location.search]);

  // Handle infinite scroll within the asset list pane
  useEffect(() => {
    if (!selectedAutoTag) return;

    const el = loadMoreTriggerRef.current;
    const root = scrollContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }
        }
      },
      { root, rootMargin: '400px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, selectedAutoTag]);

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (mappingId: number) => {
      await apiClient.delete(`/api/v1/auto-tags/mappings/${datasetId}/${mappingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autotag-mappings', datasetId] });
    },
  });

  const resetForm = () => {
    setEditingMapping(null);
    setMappingAutoTagKey('');
  };

  const handleCreateMapping = (autoTagKey: string) => {
    setMappingAutoTagKey(autoTagKey);
    setEditingMapping(null);
    setMappingDialogOpen(true);
  };

  const handleEditMapping = (mapping: AutoTagMapping) => {
    setMappingAutoTagKey(mapping.autoTagKey);
    setEditingMapping(mapping);
    setMappingDialogOpen(true);
  };

  const handleDeleteMapping = (mappingId: number) => {
    if (confirm(t.autoTagPage.deleteMappingConfirm)) {
      deleteMappingMutation.mutate(mappingId);
    }
  };

  const handleAutoTagClick = (autoTagKey: string) => {
    setSelectedAutoTag(autoTagKey);
    try {
      const sp = new URLSearchParams(location.search);
      sp.set('autoTag', encodeURIComponent(autoTagKey));
      const nextSearch = searchParamsToObject(sp);
      navigate({
        to: '/library/$datasetId/autotag-config',
        params: { datasetId },
        search: () => nextSearch,
      });
    } catch {}
  };

  // Get existing mapping for an autoTagKey
  const getExistingMapping = (autoTagKey: string) => {
    return mappingsData?.mappings.find((m) => m.autoTagKey === autoTagKey);
  };

  // Selection mode handlers
  const handleItemSelect = useCallback((itemId: string | number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearSelection();
    setIsEditPanelOpen(false);
  }, [clearSelection, setSelectionMode]);

  const handleToggleSelectionMode = useCallback(() => {
    if (selectionMode) {
      exitSelectionMode();
      return;
    }

    if (infoSidebarOpen) {
      setInfoSidebarOpen(false);
    }
    setSelectionMode(true);
  }, [exitSelectionMode, infoSidebarOpen, selectionMode, setInfoSidebarOpen, setSelectionMode]);

  useEffect(() => {
    exitSelectionMode();
  }, [exitSelectionMode]);

  // Edit panel handlers
  const toggleEditPanel = useCallback(() => {
    if (selectedItems.size === 0) return;
    setIsEditPanelOpen((prev) => {
      const next = !prev;
      if (next) setInfoSidebarOpen(false);
      return next;
    });
  }, [selectedItems.size, setInfoSidebarOpen]);

  const closeEditPanel = useCallback(() => {
    setIsEditPanelOpen(false);
  }, []);

  const closeInfoSidebarBeforeSelection = useCallback(() => {
    if (infoSidebarOpen) {
      setInfoSidebarOpen(false);
    }
  }, [infoSidebarOpen, setInfoSidebarOpen]);

  const enterSelectionModeWithItem = useCallback(
    (itemId: string | number) => {
      setSelectionMode(true);
      setSelectedItems(new Set([itemId]));
    },
    [setSelectionMode]
  );

  const selectItemRange = useCallback((itemIds: Array<string | number>) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      for (const itemId of itemIds) {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleTileDefaultClick = useCallback(
    (stack: AutoTagStack, event: MouseEvent<HTMLDivElement>) => {
      if (!infoSidebarOpen) return;
      event.preventDefault();
      onInfo(stack.id);
    },
    [infoSidebarOpen, onInfo]
  );

  const getStackLinkElement = useCallback(
    (stack: AutoTagStack) => (
      <Link
        to="/library/$datasetId/stacks/$stackId"
        params={{ datasetId, stackId: String(stack.id) }}
      />
    ),
    [datasetId]
  );

  const handleOpenStack = useCallback(
    async (stack: AutoTagStack) => {
      await onOpen(stack.id);
    },
    [onOpen]
  );

  const handleInfoStack = useCallback(
    (stack: AutoTagStack) => {
      onInfo(stack.id);
    },
    [onInfo]
  );

  const handleFindSimilarStack = useCallback(
    async (stack: AutoTagStack) => {
      await onFindSimilar(stack.id);
    },
    [onFindSimilar]
  );

  const handleAddToScratchStack = useCallback(
    async (stack: AutoTagStack) => {
      await onAddToScratch(stack.id);
    },
    [onAddToScratch]
  );

  const handleDownloadStack = useCallback(
    (stack: AutoTagStack) => {
      onDownload(stack.id);
    },
    [onDownload]
  );

  const handleToggleFavoriteStack = useCallback(
    async (stack: AutoTagStack, favorited: boolean) => {
      await onToggleFavorite(stack.id, favorited);
    },
    [onToggleFavorite]
  );

  const handleLikeStack = useCallback(
    async (stack: AutoTagStack) => {
      await onLike(stack.id);
    },
    [onLike]
  );

  const getStackDragHandlers = useCallback(
    (
      stack: AutoTagStack,
      sourceImageUrl: string | null,
      sourceImageFilename: string | undefined,
      stackIds: Array<string | number>
    ) => dragProps(stack.id, sourceImageUrl, sourceImageFilename, stackIds),
    [dragProps]
  );

  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedItems.size === 0) return;

      const stackIds = selectedStackIds;

      if (stackIds.length === 0) return;

      try {
        if (updates.addTags?.length) {
          await apiClient.bulkAddTags(stackIds, updates.addTags);
        }

        if (updates.setAuthor) {
          await apiClient.bulkSetAuthor(stackIds, updates.setAuthor);
        }

        if (updates.setMediaType) {
          await apiClient.bulkSetMediaType(stackIds, updates.setMediaType);
        }

        queryClient.invalidateQueries({
          queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
        });

        exitSelectionMode();
      } catch (error) {
        console.error('Error applying bulk updates:', error);
      }
    },
    [
      selectedItems.size,
      selectedStackIds,
      queryClient,
      datasetId,
      selectedAutoTag,
      exitSelectionMode,
      localFilter,
    ]
  );

  const handleDownloadSelectedStacks = useCallback(() => {
    if (selectedStackIds.length === 0) return;
    downloadStackOriginals(datasetId, selectedStackIds);
  }, [datasetId, selectedStackIds]);

  const handleRefreshStacks = useCallback(
    async (stackIds: Array<string | number>) => {
      if (stackIds.length === 0) return;

      try {
        await apiClient.refreshStacks(stackIds);
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
          }),
          queryClient.invalidateQueries({ queryKey: ['stacks'] }),
          queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
          queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
        ]);
        await refetchAutoTagStacks();
        exitSelectionMode();
      } catch (error) {
        console.error('Error refreshing auto-tag stacks:', error);
        alert(t.grid.refreshFailed);
      }
    },
    [
      datasetId,
      exitSelectionMode,
      localFilter,
      queryClient,
      refetchAutoTagStacks,
      selectedAutoTag,
      t,
    ]
  );

  const handleRemoveSelectedStacks = useCallback(async () => {
    if (selectedStackIds.length === 0) return;

    try {
      await apiClient.bulkRemoveStacks(selectedStackIds);
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
        }),
        queryClient.invalidateQueries({ queryKey: ['stacks'] }),
        queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] }),
        queryClient.invalidateQueries({ queryKey: ['dataset-overview', datasetId] }),
      ]);
      exitSelectionMode();
    } catch (error) {
      console.error('Error removing selected auto-tag stacks:', error);
      alert(t.grid.deleteStacksFailed);
    }
  }, [
    datasetId,
    exitSelectionMode,
    localFilter,
    queryClient,
    selectedAutoTag,
    selectedStackIds,
    t,
  ]);

  const selectionActions = useMemo(
    () =>
      createStackSelectionActions({
        selectedCount: selectedItems.size,
        copy: {
          bulkEdit: t.grid.bulkEdit,
          downloadSelected: t.contextMenu.downloadSelected,
          addToScratch: t.contextMenu.addToScratch,
          addToCollection: t.contextMenu.addToCollection,
          createNewCollection: t.contextMenu.createNewCollection,
          collectionLoading: t.collection.loading,
          noCollectionsAvailable: t.contextMenu.noCollectionsAvailable,
          mergeStacks: t.grid.mergeStacks,
          refresh: t.grid.refresh,
          removeFromCollection: t.contextMenu.removeFromCollection,
          removeFromScratch: t.contextMenu.removeFromScratch,
          deleteStacks: t.grid.deleteStacks,
          deleteStacksConfirm: t.grid.deleteStacksConfirm,
        },
        bulkEdit: { onSelect: toggleEditPanel },
        downloadSelected: { onSelect: handleDownloadSelectedStacks },
        refresh: { onSelect: () => handleRefreshStacks(selectedStackIds) },
        deleteStacks: { onSelect: handleRemoveSelectedStacks },
      }),
    [
      handleDownloadSelectedStacks,
      handleRefreshStacks,
      handleRemoveSelectedStacks,
      selectedStackIds,
      selectedItems.size,
      t,
      toggleEditPanel,
    ]
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (filter: StackFilter) => {
      setLocalFilter(filter);
      setCurrentFilter(filter);
    },
    [setCurrentFilter]
  );

  // Keyboard shortcuts
  useKeyboardShortcuts({
    i: () => {
      if (!infoSidebarOpen && selectionMode) {
        exitSelectionMode();
      }

      setInfoSidebarOpen(!infoSidebarOpen);
    },
    f: () => {
      if (!selectionMode) {
        setFilterOpen(!filterOpen);
      }
    },
    Escape: () => {
      if (selectionMode) {
        exitSelectionMode();
      }
    },
  });

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Statistics List */}
      <div className="w-80 h-full flex-shrink-0 border-r bg-white">
        <div className="h-full overflow-y-auto">
          <div className="p-4 border-b">
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t.autoTagPage.statistics}</h2>
                <JoyTagStatus
                  status={joyTagStatusComputed.status}
                  isLoading={joyTagStatusLoading}
                  message={joyTagStatusComputed.message}
                />
              </div>

              <SmallSearchField
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder={t.tagPage.searchTags}
              />

              <div className="space-y-2">
                <SmallSelect
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v as typeof sortBy)}
                  placeholder={t.tagPage.sortBy}
                >
                  <SelectItem value="name-asc">{t.tagPage.nameAsc}</SelectItem>
                  <SelectItem value="name-desc">{t.tagPage.nameDesc}</SelectItem>
                  <SelectItem value="count-desc">{t.autoTagPage.predictionCountDesc}</SelectItem>
                  <SelectItem value="count-asc">{t.autoTagPage.predictionCountAsc}</SelectItem>
                </SmallSelect>
              </div>
            </div>
          </div>

          {/* Statistics list */}
          <div className="p-2">
            {statisticsError ? (
              <div className="text-center py-8 text-red-500">
                {t.autoTagPage.errorLoadingStatistics} {(statisticsError as Error).message}
              </div>
            ) : statisticsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                {t.autoTagPage.loadingStatistics}
              </div>
            ) : filteredStatistics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? t.tagPage.noTagsFound : t.sidebar.noAutoTags}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredStatistics.map((stat) => {
                  const existingMapping = getExistingMapping(stat.autoTagKey);
                  const isSelected = selectedAutoTag === stat.autoTagKey;
                  return (
                    <div
                      key={stat.autoTagKey}
                      data-autotag-key={stat.autoTagKey}
                      ref={(el) => {
                        if (el) {
                          listItemRefs.current.set(stat.autoTagKey, el);
                        } else {
                          listItemRefs.current.delete(stat.autoTagKey);
                        }
                      }}
                      onClick={() => handleAutoTagClick(stat.autoTagKey)}
                      className={cn(
                        'px-2 py-1.5 rounded transition-colors cursor-pointer group',
                        isSelected
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm truncate font-medium">{stat.autoTagKey}</span>
                            {existingMapping && (
                              <div className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-blue-600">
                                  {existingMapping.displayName}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {strictCounts[stat.autoTagKey] ? (
                              <>
                                {strictCounts[stat.autoTagKey].predictionCount}{' '}
                                {t.autoTagPage.predictions} -{' '}
                                {strictCounts[stat.autoTagKey].assetCount} {t.autoTagPage.assets}
                              </>
                            ) : (
                              <>
                                {stat.predictionCount} {t.autoTagPage.stacksApproxAssets}{' '}
                                {stat.assetCount} {t.autoTagPage.assets}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {existingMapping ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditMapping(existingMapping);
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <SquarePen className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateMapping(stat.autoTagKey);
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected AutoTag Details */}
      {selectedAutoTag ? (
        <div
          ref={scrollContainerRef}
          className={cn(
            'flex-1 min-w-0 h-full overflow-y-auto bg-gray-50 transition-all duration-300 ease-in-out',
            rightPanelPushesContent ? 'mr-80' : 'mr-0'
          )}
        >
          <div className="p-4">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{selectedAutoTag}</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedAutoTag(null);
                    try {
                      const sp = new URLSearchParams(location.search);
                      sp.delete('autoTag');
                      const nextSearch = searchParamsToObject(sp);
                      navigate({
                        to: '/library/$datasetId/autotag-config',
                        params: { datasetId },
                        search: () => nextSearch,
                      });
                    } catch {}
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {(() => {
                const mapping = getExistingMapping(selectedAutoTag);
                return mapping ? (
                  <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200 space-y-2 max-w-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-600">{t.autoTagPage.mappedTo}</p>
                          <p className="font-medium">{mapping.displayName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditMapping(mapping)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {mapping.description && (
                      <p className="text-sm text-muted-foreground">{mapping.description}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 bg-gray-100 rounded-lg p-3 border border-gray-200 max-w-lg">
                    <p className="text-sm text-muted-foreground mb-2">
                      {t.autoTagPage.noMappingConfigured}
                    </p>
                    <Button size="sm" onClick={() => handleCreateMapping(selectedAutoTag)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t.autoTagPage.createMapping}
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Stacks with this AutoTag */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">{t.autoTagPage.stacksWithThisAutoTag}</h3>
              {stacksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allStacks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t.autoTagPage.noStacksWithThisAutoTag}
                </div>
              ) : (
                <>
                  <StackTileGrid
                    items={allStacks}
                    datasetId={datasetId}
                    gridClassName="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                    cornerRadius="rounded"
                    isSelectionMode={selectionMode}
                    selectedItems={selectedItems}
                    selectedStackIdsInOrder={selectedStackIds}
                    selectedActionCount={selectedItems.size}
                    getLinkElement={infoSidebarOpen ? undefined : getStackLinkElement}
                    onClickItem={handleTileDefaultClick}
                    onBeforeEnterSelectionMode={closeInfoSidebarBeforeSelection}
                    onEnterSelectionMode={enterSelectionModeWithItem}
                    onToggleSelection={handleItemSelect}
                    onSelectRange={selectItemRange}
                    onOpenItem={handleOpenStack}
                    onInfoItem={handleInfoStack}
                    onFindSimilarItem={handleFindSimilarStack}
                    onAddToScratchItem={handleAddToScratchStack}
                    onDownloadItem={handleDownloadStack}
                    onDownloadSelected={handleDownloadSelectedStacks}
                    onRefreshStacks={handleRefreshStacks}
                    onBulkEditSelected={toggleEditPanel}
                    onRemoveSelectedStacks={handleRemoveSelectedStacks}
                    onToggleFavoriteItem={handleToggleFavoriteStack}
                    onLikeItem={handleLikeStack}
                    getDragHandlers={getStackDragHandlers}
                  />

                  {/* Loading indicator */}
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {/* Load more indicator */}
                  {hasNextPage && !isFetchingNextPage && (
                    <div
                      ref={loadMoreTriggerRef}
                      className="text-sm text-muted-foreground text-center mt-8"
                    >
                      {t.common.scrollToLoadMore}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Demo AutoTag Display Section */}
            {(() => {
              // Get first stack with autoTags to demonstrate the component
              const stackWithAutoTags = allStacks.find(
                (stack) => Array.isArray(stack.autoTags) && stack.autoTags.length > 0
              );

              if (stackWithAutoTags) {
                return (
                  <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
                    <h4 className="text-sm font-semibold mb-2">
                      {t.autoTagPage.autoTagsFrom} {stackWithAutoTags.name}
                    </h4>
                    <AutoTagDisplay
                      autoTags={stackWithAutoTags.autoTags}
                      datasetId={datasetId}
                      onAddTag={(tag) => {
                        console.log('Would add tag:', tag, 'to stack:', stackWithAutoTags.id);
                        // In a real implementation, this would add the tag to the stack
                      }}
                      sessionStorageKey={`autotag-config-demo-${selectedAutoTag}`}
                    />
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'flex-1 min-w-0 h-full flex items-center justify-center bg-gray-50 transition-all duration-300 ease-in-out',
            rightPanelPushesContent ? 'mr-80' : 'mr-0'
          )}
        >
          <div className="text-center">
            <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">{t.autoTagPage.selectAutoTagPrompt}</p>
          </div>
        </div>
      )}

      {/* Mapping Modal */}
      <AutoTagMappingModal
        open={mappingDialogOpen}
        onOpenChange={(open) => {
          setMappingDialogOpen(open);
          if (!open) {
            resetForm();
          }
        }}
        datasetId={datasetId}
        autoTagKey={mappingAutoTagKey}
        existingMapping={editingMapping}
        onSuccess={(_mapping) => {
          queryClient.invalidateQueries({ queryKey: ['autotag-mappings', datasetId] });
          queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
          setMappingDialogOpen(false);
          resetForm();
        }}
      />

      {/* InfoSidebar - only show when not in selection mode */}
      {!selectionMode && <InfoSidebar />}

      {/* BulkEditPanel - only show when in selection mode */}
      {isEditPanelOpen &&
        selectionMode &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedItems}
            onClose={closeEditPanel}
            onSave={applyEditUpdates}
            items={selectedStackSummaries}
          />,
          document.body
        )}

      {/* Selection Action Bar - only show when in selection mode */}
      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onExitSelectionMode={exitSelectionMode}
          actions={selectionActions}
        />
      )}

      {/* Portal for header actions */}
      {createPortal(
        <>
          {/* Filter button */}
          <HeaderIconButton
            onClick={() => !selectionMode && setFilterOpen(!filterOpen)}
            disabled={selectionMode}
            isActive={filterOpen}
            className={selectionMode ? 'opacity-50 cursor-not-allowed' : ''}
            aria-label={
              selectionMode
                ? t.header.filterDisabledDuringSelection
                : filterOpen
                  ? t.header.closeFilter
                  : t.header.openFilter
            }
          >
            <Filter size={18} />
          </HeaderIconButton>

          <HeaderIconButton
            onClick={handleToggleSelectionMode}
            isActive={selectionMode}
            aria-label={selectionMode ? t.header.exitSelectionMode : t.header.enterSelectionMode}
          >
            <Check size={18} />
          </HeaderIconButton>

          {/* Info button - only show when not in selection mode */}
          {!selectionMode && (
            <HeaderIconButton
              onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
              isActive={infoSidebarOpen}
              aria-label={infoSidebarOpen ? t.viewer.closeInfo : t.viewer.openInfo}
            >
              <Info size={18} />
            </HeaderIconButton>
          )}
        </>,
        document.getElementById('header-actions') || document.body
      )}

      {/* Filter Panel */}
      <FilterPanel currentFilter={localFilter} onFilterChange={handleFilterChange} />
    </div>
  );
}

function appendFilterParams(target: URLSearchParams, filter: StackFilter) {
  if (filter.hasNoTags) {
    target.append('hasNoTags', 'true');
  }
  if (filter.hasNoAuthor) {
    target.append('hasNoAuthor', 'true');
  }
  if (Array.isArray(filter.tags)) {
    for (const tag of filter.tags) {
      target.append('tags', tag);
    }
  }
  if (Array.isArray(filter.authors)) {
    for (const author of filter.authors) {
      target.append('authors', author);
    }
  }
  if (filter.isFavorite !== undefined) {
    target.append('isFavorite', filter.isFavorite.toString());
  }
  if (filter.mediaCategory) {
    target.append('mediaCategory', filter.mediaCategory);
  }
  if (Array.isArray(filter.mediaTypes)) {
    for (const mediaType of filter.mediaTypes) {
      target.append('mediaTypes', mediaType);
    }
  }
  if (filter.search) {
    target.append('search', filter.search);
  }
}

function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const entries = Array.from(params.entries());
  return entries.reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeStackTags(tags?: Stack['tags']): string[] {
  if (!tags) return [];
  if (tags.every((tag) => typeof tag === 'string')) {
    return (tags as string[]).filter((tag) => tag.length > 0);
  }

  return (tags as Array<{ name?: string; title?: string; displayName?: string }>)
    .map((tag) => tag.name ?? tag.title ?? tag.displayName ?? '')
    .filter((tag): tag is string => tag.length > 0);
}

function getStackAuthor(author: Stack['author']): string | undefined {
  if (!author) return undefined;
  return typeof author === 'string' ? author : (author.name ?? undefined);
}

function toNumericId(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
