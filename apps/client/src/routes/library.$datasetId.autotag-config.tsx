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
  Pencil,
  Plus,
  Search,
  SquarePen,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BulkEditPanel from '@/components/BulkEditPanel.tsx';
import FilterPanel from '@/components/FilterPanel';
import InfoSidebar from '@/components/InfoSidebar';
import AutoTagMappingModal from '@/components/modals/AutoTagMappingModal';
import { StackContextMenu } from '@/components/modals/StackContextMenu';
import { AutoTagDisplay } from '@/components/ui/autotag-display';
import { Button } from '@/components/ui/button';
import { SmallSearchField, SmallSelect } from '@/components/ui/Controls';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { Input } from '@/components/ui/input';
import { StackTile } from '@/components/ui/Stack';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useKeyboardShortcuts } from '@/hooks/features/useKeyboardShortcuts';
import { useStackTile } from '@/hooks/useStackTile';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  currentFilterAtom,
  filterOpenAtom,
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
} from '@/stores/ui';
import type { StackFilter } from '@/types';

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

interface AutoTagWithMapping {
  autoTagKey: string;
  mappedTag?: {
    id: number;
    title: string;
  };
  displayName?: string;
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

interface Tag {
  id: number;
  title: string;
  dataSetId: number;
}

function AutoTagConfigPage() {
  const { datasetId } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const actions = useStackTile(datasetId);
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
  const [, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const lastClickedIndexRef = useRef<number | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterOpen, setFilterOpen] = useAtom(filterOpenAtom);
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
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
  }, [datasetId, debouncedSearchQuery]);

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
    missing.forEach((k) => requestedStrictKeysRef.current.add(k));

    const run = async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const params = new URLSearchParams({ threshold: '0.4' });
        batch.forEach((k) => params.append('keys', k));
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
  }, [datasetId, filteredStatistics, statisticsData?.method]);

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
              batch.forEach((k) => requestedStrictKeysRef.current.add(k));
              const params = new URLSearchParams({ threshold: '0.4' });
              batch.forEach((k) => params.append('keys', k));
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
  }, [filteredStatistics, statisticsData?.method, strictCounts, datasetId]);

  // Fetch AutoTag mappings
  const {
    data: mappingsData,
    isLoading: mappingsLoading,
    error: mappingsError,
  } = useQuery<AutoTagMappingsResponse>({
    queryKey: ['autotag-mappings', datasetId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/v1/auto-tags/mappings/${datasetId}?limit=200&offset=0`
      );
      return response.data;
    },
  });

  // Build query parameters with filter
  const buildQueryParams = () => {
    const params = new URLSearchParams({
      autoTag: selectedAutoTag || '',
      dataSetId: datasetId,
      limit: '50',
      offset: '0',
    });

    // Add filter parameters
    if (localFilter.hasNoTags) {
      params.append('hasNoTags', 'true');
    }
    if (localFilter.hasNoAuthor) {
      params.append('hasNoAuthor', 'true');
    }
    if (localFilter.tags && localFilter.tags.length > 0) {
      for (const tag of localFilter.tags) {
        params.append('tags', tag);
      }
    }
    if (localFilter.authors && localFilter.authors.length > 0) {
      for (const author of localFilter.authors) {
        params.append('authors', author);
      }
    }
    if (localFilter.isFavorite !== undefined) {
      params.append('isFavorite', localFilter.isFavorite.toString());
    }
    if (localFilter.search) {
      params.append('search', localFilter.search);
    }

    return params.toString();
  };

  // Fetch stacks with selected AutoTag using infinite query
  const {
    data: autoTagStacksData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: stacksLoading,
  } = useInfiniteQuery({
    queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
    queryFn: async ({ pageParam = 0 }) => {
      if (!selectedAutoTag) return { stacks: [], total: 0, limit: 50, offset: 0 };

      const params = new URLSearchParams({
        autoTag: selectedAutoTag,
        dataSetId: datasetId,
        limit: '50',
        offset: pageParam.toString(),
      });

      // Add filter parameters
      if (localFilter.hasNoTags) {
        params.append('hasNoTags', 'true');
      }
      if (localFilter.hasNoAuthor) {
        params.append('hasNoAuthor', 'true');
      }
      if (localFilter.tags && localFilter.tags.length > 0) {
        localFilter.tags.forEach((tag) => params.append('tags', tag));
      }
      if (localFilter.authors && localFilter.authors.length > 0) {
        localFilter.authors.forEach((author) => params.append('authors', author));
      }
      if (localFilter.isFavorite !== undefined) {
        params.append('isFavorite', localFilter.isFavorite.toString());
      }
      if (localFilter.search) {
        params.append('search', localFilter.search);
      }

      const response = await apiClient.get(`/api/v1/stacks/search/autotag?${params.toString()}`);
      return response.data;
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: !!selectedAutoTag,
    initialPageParam: 0,
  });

  // Flatten all stacks from pages
  const allStacks = useMemo(() => {
    return autoTagStacksData?.pages.flatMap((page) => page.stacks) || [];
  }, [autoTagStacksData]);

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

  // Handle infinite scroll (observe page scroll via viewport)
  useEffect(() => {
    const el = loadMoreTriggerRef.current;
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
      { root: null, rootMargin: '400px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, allStacks.length, selectedAutoTag]);

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
    if (confirm('Are you sure you want to delete this mapping?')) {
      deleteMappingMutation.mutate(mappingId);
    }
  };

  const handleAutoTagClick = (autoTagKey: string) => {
    setSelectedAutoTag(autoTagKey);
    try {
      const sp = new URLSearchParams(location.search);
      sp.set('autoTag', encodeURIComponent(autoTagKey));
      navigate({
        to: '/library/$datasetId/autotag-config',
        params: { datasetId },
        search: () => Object.fromEntries(sp.entries()) as any,
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
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
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

  const handleStackClick = useCallback(
    (stack: any, event: React.MouseEvent) => {
      const idx = allStacks.findIndex((s: any) => s?.id === stack.id);

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        handleItemSelect(stack.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const [start, end] = last < idx ? [last, idx] : [idx, last];
          const next = new Set(selectedItems);
          for (let i = start; i <= end; i++) {
            const it = allStacks[i];
            if (it) next.add(it.id);
          }
          setSelectedItems(next);
        } else {
          handleItemSelect(stack.id);
        }
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (selectionMode) {
        event.preventDefault();
        handleItemSelect(stack.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      setSelectedItemId(stack.id);
      setInfoSidebarOpen(true);
    },
    [
      selectionMode,
      allStacks,
      selectedItems,
      setSelectedItems,
      handleItemSelect,
      setSelectedItemId,
      setInfoSidebarOpen,
      setSelectionMode,
    ]
  );

  const applyEditUpdates = useCallback(
    async (updates: any) => {
      // Apply bulk updates to selected items
      if (selectedItems.size === 0) return;

      try {
        const stackIds = Array.from(selectedItems).map((id) => Number(id));

        // Apply tags
        if (updates.addTags && updates.addTags.length > 0) {
          await apiClient.bulkAddTags(stackIds, updates.addTags);
        }

        // Apply author
        if (updates.author) {
          await apiClient.bulkSetAuthor(stackIds, updates.author);
        }

        // Apply media type
        if (updates.mediaType) {
          await apiClient.bulkSetMediaType(stackIds, updates.mediaType);
        }

        // Apply favorite
        if (updates.favorite !== undefined) {
          await apiClient.bulkSetFavorite(stackIds, updates.favorite);
        }

        // Refresh data
        queryClient.invalidateQueries({
          queryKey: ['autotag-stacks', datasetId, selectedAutoTag, localFilter],
        });

        exitSelectionMode();
      } catch (error) {
        console.error('Error applying bulk updates:', error);
      }
    },
    [selectedItems, queryClient, datasetId, selectedAutoTag, exitSelectionMode]
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
    r: () => {
      if (!selectionMode) {
        setInfoSidebarOpen(false);
        setSelectionMode(true);
      } else {
        exitSelectionMode();
      }
    },
    i: () => {
      if (!infoSidebarOpen) {
        if (selectionMode) {
          exitSelectionMode();
        }
      }
      setInfoSidebarOpen(!infoSidebarOpen);
    },
    f: () => {
      if (!selectionMode) {
        setFilterOpen(!filterOpen);
      }
    },
    e: () => {
      if (selectionMode && selectedItems.size > 0) {
        toggleEditPanel();
      }
    },
    Escape: () => {
      if (selectionMode) {
        exitSelectionMode();
      }
    },
  });

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Statistics List */}
      <div className="w-80 flex-shrink-0">
        <div className="sticky top-14 h-[calc(100vh-56px)] border-r bg-white">
          <div className="overflow-y-auto h-full">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold mb-3">AutoTag Statistics</h2>

              <div className="space-y-3">
                <SmallSearchField
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search tags..."
                />

                <div className="space-y-2">
                  <SmallSelect
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as typeof sortBy)}
                    placeholder="Sort by..."
                  >
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="count-desc">Prediction Count (High to Low)</SelectItem>
                    <SelectItem value="count-asc">Prediction Count (Low to High)</SelectItem>
                  </SmallSelect>
                </div>
              </div>
            </div>

            {/* Statistics list */}
            <div className="p-2">
              {statisticsError ? (
                <div className="text-center py-8 text-red-500">
                  Error loading statistics: {(statisticsError as Error).message}
                </div>
              ) : statisticsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading statistics...</div>
              ) : filteredStatistics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'No tags found' : 'No AutoTag data yet'}
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
                              <span className="text-sm truncate font-medium">
                                {stat.autoTagKey}
                              </span>
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
                                  {strictCounts[stat.autoTagKey].predictionCount} predictions •{' '}
                                  {strictCounts[stat.autoTagKey].assetCount} assets
                                </>
                              ) : (
                                <>
                                  {stat.predictionCount} stacks • ≈{stat.assetCount} assets
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
      </div>

      {/* Selected AutoTag Details */}
      {selectedAutoTag ? (
        <div
          ref={scrollContainerRef}
          className={cn(
            'flex-1 bg-gray-50 transition-all duration-300 ease-in-out',
            infoSidebarOpen && !selectionMode ? 'mr-80' : 'mr-0',
            isEditPanelOpen && selectionMode ? 'mr-80' : ''
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
                      navigate({
                        to: '/library/$datasetId/autotag-config',
                        params: { datasetId },
                        search: () => Object.fromEntries(sp.entries()) as any,
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
                          <p className="text-sm text-gray-600">Mapped to:</p>
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
                    <p className="text-sm text-muted-foreground mb-2">No mapping configured</p>
                    <Button size="sm" onClick={() => handleCreateMapping(selectedAutoTag)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Create Mapping
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Stacks with this AutoTag */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Stacks with this AutoTag</h3>
              {stacksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allStacks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No stacks found with this AutoTag
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {allStacks.map((stack: any) => {
                      const {
                        onOpen,
                        onFindSimilar,
                        onAddToScratch,
                        onToggleFavorite,
                        onLike,
                        dragProps,
                        onInfo,
                      } = actions;
                      const thumb = stack.thumbnail || stack.thumbnailUrl || '/no-image.png';
                      const likeCount = Number(stack.likeCount ?? stack.liked ?? 0);
                      const pageCount =
                        stack.assetCount || stack._count?.assets || stack.assetsCount || 0;
                      const isFav = stack.favorited || stack.isFavorite || false;
                      return infoSidebarOpen ? (
                        <StackTile
                          key={stack.id}
                          thumbnailUrl={thumb}
                          pageCount={pageCount}
                          favorited={isFav}
                          likeCount={likeCount}
                          onClick={() => {
                            setSelectedItemId(stack.id);
                            setInfoSidebarOpen(true);
                          }}
                          onInfo={() => {
                            setSelectedItemId(stack.id);
                            setInfoSidebarOpen(true);
                          }}
                          onFindSimilar={() => onFindSimilar(stack.id)}
                          onAddToScratch={() => onAddToScratch(stack.id)}
                          onToggleFavorite={() => onToggleFavorite(stack.id, isFav)}
                          onLike={() => onLike(stack.id)}
                          dragHandlers={dragProps(stack.id)}
                        />
                      ) : (
                        <StackTile
                          key={stack.id}
                          thumbnailUrl={thumb}
                          pageCount={pageCount}
                          favorited={isFav}
                          likeCount={likeCount}
                          onOpen={() => onOpen(stack.id)}
                          onInfo={() => {
                            setSelectedItemId(stack.id);
                            setInfoSidebarOpen(true);
                          }}
                          onFindSimilar={() => onFindSimilar(stack.id)}
                          onAddToScratch={() => onAddToScratch(stack.id)}
                          onToggleFavorite={() => onToggleFavorite(stack.id, isFav)}
                          onLike={() => onLike(stack.id)}
                          dragHandlers={dragProps(stack.id)}
                          asChild
                        >
                          <Link
                            to="/library/$datasetId/stacks/$stackId"
                            params={{ datasetId, stackId: String(stack.id) }}
                          />
                        </StackTile>
                      );
                    })}
                  </div>

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
                      Scroll to load more...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Demo AutoTag Display Section */}
            {(() => {
              // Get first stack with autoTags to demonstrate the component
              const stackWithAutoTags = allStacks.find(
                (stack: any) => stack.autoTags && stack.autoTags.length > 0
              );

              if (stackWithAutoTags) {
                return (
                  <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
                    <h4 className="text-sm font-semibold mb-2">
                      AutoTags from: {stackWithAutoTags.name}
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
            'flex-1 flex items-center justify-center bg-gray-50 transition-all duration-300 ease-in-out',
            infoSidebarOpen && !selectionMode ? 'mr-80' : 'mr-0',
            isEditPanelOpen && selectionMode ? 'mr-80' : ''
          )}
        >
          <div className="text-center">
            <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Select an AutoTag to view details</p>
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
        onSuccess={(mapping) => {
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
            items={allStacks.filter((s: any) => selectedItems.has(s.id))}
          />,
          document.body
        )}

      {/* Selection Action Bar - only show when in selection mode */}
      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onExitSelectionMode={exitSelectionMode}
          actions={
            selectedItems.size > 0
              ? [
                  {
                    label: 'Bulk Edit',
                    value: 'bulk-edit',
                    onSelect: toggleEditPanel,
                    icon: <Pencil size={12} />,
                    group: 'primary',
                  },
                ]
              : []
          }
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
                ? 'Filter disabled during selection'
                : filterOpen
                  ? 'Close filter'
                  : 'Open filter'
            }
          >
            <Filter size={18} />
          </HeaderIconButton>

          {/* Selection mode button */}
          <HeaderIconButton
            onClick={() => {
              if (!selectionMode) {
                setInfoSidebarOpen(false); // Close info sidebar when entering selection mode
                setSelectionMode(true);
              } else {
                exitSelectionMode(); // Use exitSelectionMode to properly clean up
              }
            }}
            isActive={selectionMode}
            aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
          >
            <Check size={18} />
          </HeaderIconButton>

          {/* Info button - only show when not in selection mode */}
          {!selectionMode && (
            <HeaderIconButton
              onClick={() => setInfoSidebarOpen(!infoSidebarOpen)}
              isActive={infoSidebarOpen}
              aria-label={infoSidebarOpen ? 'Close info panel' : 'Open info panel'}
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
