import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import {
  ArrowDown,
  ArrowUpDown,
  Calendar,
  Heart,
  Images,
  Monitor,
  Palette,
  PlusCircle,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SuggestInput } from '@/components/ui/suggest-input';
import { useSwipeClose } from '@/hooks/features/useSwipeClose';
import { apiClient } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { customColorAtom, filterOpenAtom, selectionModeAtom } from '@/stores/ui';
import type { HueCategory, MediaCategory, MediaType, StackFilter } from '@/types';

// 色味カテゴリの定義（7色、ブライト-ライト間のトーン）
const HUE_CATEGORIES: { id: HueCategory; name: string; color: string }[] = [
  { id: 'red', name: '赤', color: '#FF8888' },
  { id: 'orange', name: 'オレンジ', color: '#FFB366' },
  { id: 'yellow', name: '黄', color: '#FFE066' },
  { id: 'green', name: '緑', color: '#66DD66' },
  { id: 'cyan', name: 'シアン', color: '#66CCFF' },
  { id: 'blue', name: '青', color: '#6699FF' },
  { id: 'violet', name: '紫', color: '#BB66FF' },
];

const FILTER_CHOICE_BUTTON_CLASS =
  'px-1.5 py-3 rounded-md text-[11px] font-medium leading-none whitespace-nowrap transition-colors';

function isMediaCategory(value: unknown): value is MediaCategory {
  return value === 'image' || value === 'comic' || value === 'video';
}

function isMediaType(value: unknown): value is MediaType {
  return value === 'image' || value === 'video' || value === 'multipleImages';
}

const MEDIA_TYPE_OPTIONS: Array<{
  value: MediaType;
  labelKey: 'images' | 'videos' | 'multipleImages';
}> = [
  { value: 'image', labelKey: 'images' },
  { value: 'video', labelKey: 'videos' },
  { value: 'multipleImages', labelKey: 'multipleImages' },
];

function normalizeMediaTypes(values: MediaType[]): MediaType[] | undefined {
  const selected = MEDIA_TYPE_OPTIONS.map((option) => option.value).filter((value) =>
    values.includes(value)
  );
  return selected.length === 0 ? undefined : selected;
}

function readMediaTypes(value: unknown): MediaType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return normalizeMediaTypes(value.filter(isMediaType));
}

interface FilterPanelProps {
  currentFilter: StackFilter;
  currentSort?: { field: string; order: 'asc' | 'desc' };
  onFilterChange: (filter: StackFilter) => void;
  onSortChange?: (sort: { field: string; order: 'asc' | 'desc' }) => void;
  isSmartCollection?: boolean;
  collectionId?: number;
  originalFilterConfig?: Record<string, any>;
  isFilterModified?: boolean;
}

function FilterPanel({
  currentFilter,
  currentSort,
  onFilterChange,
  onSortChange,
  isSmartCollection = false,
  collectionId,
  originalFilterConfig,
  isFilterModified = false,
}: FilterPanelProps) {
  const t = useT();
  const [isOpen, setIsOpen] = useAtom(filterOpenAtom);
  const [selectionMode] = useAtom(selectionModeAtom);
  const [customColor, setCustomColor] = useAtom(customColorAtom);
  const [localFilter, setLocalFilter] = useState<StackFilter>(currentFilter);
  const [tagInput, setTagInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [authorSuggestions, setAuthorSuggestions] = useState<string[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [authorLoading, setAuthorLoading] = useState(false);
  const filterCommitTimerRef = useRef<number | null>(null);
  // Ref for the Search input to focus when panel opens
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const params = useParams({ strict: false });
  const routeParams = params as { datasetId?: string; mediaType?: string };
  const datasetId = routeParams.datasetId;
  const routeMediaCategory = isMediaCategory(routeParams.mediaType)
    ? routeParams.mediaType
    : undefined;
  const queryClient = useQueryClient();

  // Smart collection dialog state
  const [isSmartCollectionDialogOpen, setIsSmartCollectionDialogOpen] = useState(false);
  const [smartCollectionName, setSmartCollectionName] = useState('');
  const [isCreatingSmartCollection, setIsCreatingSmartCollection] = useState(false);
  const [hasFilterChanges, setHasFilterChanges] = useState(false);
  const [isUpdatingSmartCollection, setIsUpdatingSmartCollection] = useState(false);
  // Composition state for Search input (avoid interfering with IME)
  const searchIsComposingRef = useRef(false);
  const panelRootRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useSwipeClose<HTMLDivElement>({
    direction: 'right',
    isActive: isOpen,
    onClose: () => setIsOpen(false),
  });

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRootRef.current = node;
      swipeRef(node);
    },
    [swipeRef]
  );

  // Update local filter when props change
  useEffect(() => {
    setLocalFilter(currentFilter);
  }, [currentFilter]);

  // Convert filter to config format
  const convertFilterToConfig = useCallback((filter: StackFilter): Record<string, any> => {
    const config: any = {};

    if (filter.search) config.search = filter.search;
    if (filter.isFavorite !== undefined) config.favorited = filter.isFavorite;
    if (filter.isLiked !== undefined) config.liked = filter.isLiked;
    if (filter.tags) config.tagIds = filter.tags;
    if (filter.authors) config.authorNames = filter.authors;
    if (filter.hasNoTags) config.hasNoTags = filter.hasNoTags;
    if (filter.hasNoAuthor) config.hasNoAuthor = filter.hasNoAuthor;
    if (filter.mediaCategory) config.mediaCategory = filter.mediaCategory;
    if (filter.mediaTypes?.length) config.mediaTypes = filter.mediaTypes;
    if (filter.colorFilter) config.colorFilter = filter.colorFilter;

    return config;
  }, []);

  // Check for filter changes in smart collection
  useEffect(() => {
    if (isSmartCollection && originalFilterConfig) {
      const currentConfig = convertFilterToConfig(localFilter);
      const hasChanges = JSON.stringify(currentConfig) !== JSON.stringify(originalFilterConfig);
      setHasFilterChanges(hasChanges);
    }
  }, [localFilter, isSmartCollection, originalFilterConfig, convertFilterToConfig]);

  // Close filter panel when selection mode is enabled
  useEffect(() => {
    if (selectionMode && isOpen) {
      setIsOpen(false);
    }
  }, [selectionMode, isOpen, setIsOpen]);

  // Focus the Search field when the filter panel opens
  useEffect(() => {
    if (isOpen) {
      // Wait for the slide-in transition (~300ms) to complete so caret is visible
      const timer = window.setTimeout(() => {
        const root = panelRootRef.current;
        const active = document.activeElement as HTMLElement | null;
        const activeInsidePanel = !!(
          active &&
          root &&
          active.closest('[data-filter-panel-root="true"]') === root
        );
        // Only auto-focus when nothing else inside the panel is focused
        if (!activeInsidePanel || active === document.body) {
          searchInputRef.current?.focus({ preventScroll: true });
        }
      }, 320);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  const commitFilterChange = useCallback(
    (filter: StackFilter, delayMs: number) => {
      if (filterCommitTimerRef.current) {
        window.clearTimeout(filterCommitTimerRef.current);
      }

      filterCommitTimerRef.current = window.setTimeout(() => {
        filterCommitTimerRef.current = null;
        startTransition(() => {
          onFilterChange(filter);
        });
      }, delayMs);
    },
    [onFilterChange]
  );

  // Apply filter changes with debouncing for text inputs
  const updateFilter = useCallback(
    (updates: Partial<StackFilter>, immediate = false) => {
      const newFilter = { ...localFilter, ...updates };
      setLocalFilter(newFilter);

      if (immediate) {
        commitFilterChange(newFilter, 0);
      } else {
        commitFilterChange(newFilter, 300);
      }
    },
    [localFilter, commitFilterChange]
  );

  const updateColorSimilarityThreshold = useCallback(
    (value: number) => {
      const threshold = Math.max(0, Math.min(100, value));
      updateFilter(
        {
          colorFilter: {
            ...localFilter.colorFilter,
            similarityThreshold: threshold > 0 ? threshold : undefined,
          },
        },
        false
      );
    },
    [localFilter.colorFilter, updateFilter]
  );

  const colorSimilarityThreshold = localFilter.colorFilter?.similarityThreshold ?? 0;
  const hasHueSelection = Boolean(localFilter.colorFilter?.hueCategories?.length);
  const selectedMediaTypes = localFilter.mediaTypes ?? [];
  const mediaTypeLabels = useMemo<Record<MediaType, string>>(
    () => ({
      image: t.filter.images,
      video: t.filter.videos,
      multipleImages: t.filter.multipleImages,
    }),
    [t.filter.images, t.filter.multipleImages, t.filter.videos]
  );

  const updateMediaTypeSelection = useCallback(
    (mediaType: MediaType, checked: boolean) => {
      const selected = new Set(localFilter.mediaTypes ?? []);
      if (checked) {
        selected.add(mediaType);
      } else {
        selected.delete(mediaType);
      }
      updateFilter({ mediaTypes: normalizeMediaTypes([...selected]) }, true);
    },
    [localFilter.mediaTypes, updateFilter]
  );

  const clearMediaTypeSelection = useCallback(() => {
    updateFilter({ mediaTypes: undefined }, true);
  }, [updateFilter]);

  const sortField = currentSort?.field ?? 'recommended';
  const sortOrder = currentSort?.order ?? 'desc';

  const updateSortField = useCallback(
    (field: string) => {
      onSortChange?.({ field, order: sortOrder });
    },
    [onSortChange, sortOrder]
  );

  const toggleSortOrder = useCallback(() => {
    onSortChange?.({
      field: sortField,
      order: sortOrder === 'desc' ? 'asc' : 'desc',
    });
  }, [onSortChange, sortField, sortOrder]);

  const sortOrderLabel = useMemo(() => {
    return sortOrder === 'desc' ? t.filter.descending : t.filter.ascending;
  }, [sortOrder, t.filter.ascending, t.filter.descending]);
  const clearFilter = () => {
    if (isSmartCollection && originalFilterConfig) {
      // For smart collections, restore to original filter config
      const restoredFilter: StackFilter = {
        datasetId: currentFilter.datasetId,
      };

      if (originalFilterConfig.search) restoredFilter.search = originalFilterConfig.search;
      if (originalFilterConfig.favorited !== undefined)
        restoredFilter.isFavorite = originalFilterConfig.favorited;
      if (originalFilterConfig.liked !== undefined)
        restoredFilter.isLiked = originalFilterConfig.liked;
      if (originalFilterConfig.tagIds) restoredFilter.tags = originalFilterConfig.tagIds;
      if (originalFilterConfig.authorNames)
        restoredFilter.authors = originalFilterConfig.authorNames;
      if (originalFilterConfig.hasNoTags) restoredFilter.hasNoTags = originalFilterConfig.hasNoTags;
      if (originalFilterConfig.hasNoAuthor)
        restoredFilter.hasNoAuthor = originalFilterConfig.hasNoAuthor;
      if (originalFilterConfig.mediaCategory)
        restoredFilter.mediaCategory = originalFilterConfig.mediaCategory as MediaCategory;
      restoredFilter.mediaTypes = readMediaTypes(originalFilterConfig.mediaTypes);
      if (originalFilterConfig.colorFilter)
        restoredFilter.colorFilter = originalFilterConfig.colorFilter;

      setLocalFilter(restoredFilter);
      commitFilterChange(restoredFilter, 0);
    } else {
      // For regular views and manual collections, clear all filters
      const clearedFilter: StackFilter = {
        datasetId: localFilter.datasetId,
        mediaCategory: routeMediaCategory,
      };
      setLocalFilter(clearedFilter);
      commitFilterChange(clearedFilter, 0);
    }
  };

  const hasActiveFilters =
    isSmartCollection && isFilterModified
      ? true // For smart collections, show "Clear all" when filter is modified
      : Object.keys(localFilter).some((key) => {
          if (key === 'datasetId') return false;
          if (key === 'mediaCategory') {
            return Boolean(
              localFilter.mediaCategory && localFilter.mediaCategory !== routeMediaCategory
            );
          }
          return Boolean(localFilter[key as keyof StackFilter]);
        });

  // Handle smart collection update
  const handleUpdateSmartCollection = async () => {
    if (!collectionId) return;

    setIsUpdatingSmartCollection(true);
    try {
      const filterConfig = convertFilterToConfig(localFilter);

      await apiClient.updateCollection(collectionId, {
        filterConfig,
      });

      // Refresh collection data
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] });
      setHasFilterChanges(false);
    } catch (error) {
      console.error('Error updating smart collection:', error);
    } finally {
      setIsUpdatingSmartCollection(false);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (filterCommitTimerRef.current) {
        window.clearTimeout(filterCommitTimerRef.current);
      }
    };
  }, []);

  // Don't render if selection mode is active
  if (selectionMode) {
    return null;
  }

  return (
    <>
      {/* Filter Panel - Pure Floating Style with slide animation */}
      <div
        ref={setPanelRef}
        data-filter-panel-root="true"
        className={cn(
          'fixed top-16 right-4 bottom-[68px] w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
        )}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{t.filter.title}</h2>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilter}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {t.filter.clearAll}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                aria-label={t.filter.closeFilter}
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Filter Content */}
          <div className="flex-1 overflow-auto p-4 space-y-6 bg-gray-50">
            {/* Search */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Search size={16} />
                {t.filter.search}
              </label>
              <input
                type="text"
                ref={searchInputRef}
                value={localFilter.search || ''}
                onChange={(e) => updateFilter({ search: e.target.value || undefined })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if (
                      (e as any).isComposing ||
                      (e.nativeEvent as any)?.isComposing ||
                      searchIsComposingRef.current
                    ) {
                      return; // let IME handle it
                    }
                    e.currentTarget.blur();
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onCompositionStart={() => {
                  searchIsComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  setTimeout(() => {
                    searchIsComposingRef.current = false;
                  }, 0);
                }}
                placeholder={t.filter.searchByName}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Favorites */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Star size={16} />
                {t.filter.favorites}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter({ isFavorite: undefined }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isFavorite === undefined
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.all}
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({ isFavorite: true }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isFavorite === true
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.favs}
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({ isFavorite: false }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isFavorite === false
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.notFavs}
                </button>
              </div>
            </div>

            {/* Likes */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Heart size={16} />
                {t.filter.likes}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter({ isLiked: undefined }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isLiked === undefined
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.all}
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({ isLiked: true }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isLiked === true
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.liked}
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({ isLiked: false }, true)}
                  className={cn(
                    FILTER_CHOICE_BUTTON_CLASS,
                    localFilter.isLiked === false
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  {t.filter.notLiked}
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Tag size={16} />
                {t.filter.tags}
              </label>
              <div className="space-y-2">
                {/* No Tags Filter */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localFilter.hasNoTags || false}
                    onChange={(e) =>
                      updateFilter({ hasNoTags: e.target.checked ? true : undefined }, true)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">{t.filter.showOnlyWithoutTags}</span>
                </label>
                <div className="space-y-2">
                  <SuggestInput
                    value={tagInput}
                    onChange={setTagInput}
                    onSelect={(tag) => {
                      if (tag && !localFilter.tags?.includes(tag)) {
                        updateFilter(
                          {
                            tags: [...(localFilter.tags || []), tag],
                          },
                          true
                        );
                        setTagInput('');
                      }
                    }}
                    onSearch={async (query) => {
                      setTagLoading(true);
                      try {
                        const results = await apiClient.searchTags(query, datasetId);
                        const suggestions = results
                          .map((tag) => (typeof tag === 'string' ? tag : tag?.title))
                          .filter(
                            (title): title is string => Boolean(title) && typeof title === 'string'
                          );
                        setTagSuggestions(suggestions);
                      } catch (error) {
                        console.error('Error searching tags:', error);
                        setTagSuggestions([]);
                      } finally {
                        setTagLoading(false);
                      }
                    }}
                    placeholder={t.filter.typeTagEnter}
                    suggestions={tagSuggestions}
                    loading={tagLoading}
                  />
                  {localFilter.tags && localFilter.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {localFilter.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-700 transition-colors"
                          onClick={() => {
                            updateFilter(
                              {
                                tags: localFilter.tags?.filter((t) => t !== tag),
                              },
                              true
                            );
                          }}
                        >
                          {tag}
                          <X size={12} className="ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Authors */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar size={16} />
                {t.filter.authors}
              </label>
              <div className="space-y-2">
                {/* No Author Filter */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localFilter.hasNoAuthor || false}
                    onChange={(e) =>
                      updateFilter({ hasNoAuthor: e.target.checked ? true : undefined }, true)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">{t.filter.showOnlyWithoutAuthor}</span>
                </label>
                <SuggestInput
                  value={authorInput}
                  onChange={setAuthorInput}
                  onSelect={(author) => {
                    if (author) {
                      const currentAuthors = localFilter.authors || [];
                      if (!currentAuthors.includes(author)) {
                        updateFilter(
                          {
                            authors: [...currentAuthors, author],
                          },
                          true
                        );
                      }
                      setAuthorInput('');
                    }
                  }}
                  onSearch={async (query) => {
                    setAuthorLoading(true);
                    try {
                      const results = await apiClient.searchAuthors(query);
                      const suggestions = results
                        .map((author) => (typeof author === 'string' ? author : author?.name))
                        .filter(
                          (name): name is string => Boolean(name) && typeof name === 'string'
                        );
                      setAuthorSuggestions(suggestions);
                    } catch (error) {
                      console.error('Error searching authors:', error);
                      setAuthorSuggestions([]);
                    } finally {
                      setAuthorLoading(false);
                    }
                  }}
                  placeholder={t.filter.searchAuthors}
                  suggestions={authorSuggestions}
                  loading={authorLoading}
                />
                {localFilter.authors && localFilter.authors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {localFilter.authors.map((author) => (
                      <Badge
                        key={author}
                        variant="secondary"
                        className="cursor-pointer bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-700 transition-colors"
                        onClick={() => {
                          updateFilter(
                            {
                              authors: localFilter.authors?.filter((a) => a !== author),
                            },
                            true
                          );
                        }}
                      >
                        {author}
                        <X size={12} className="ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Color Filter */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Palette size={16} />
                {t.filter.colorFilter}
              </label>

              {/* Color Categories */}
              <div className="space-y-2">
                <div className="flex gap-2 justify-between">
                  {HUE_CATEGORIES.map((hue) => {
                    const isSelected =
                      (localFilter.colorFilter?.hueCategories?.[0] || null) === hue.id;
                    return (
                      <button
                        key={hue.id}
                        type="button"
                        onClick={() => {
                          const nextCategories = isSelected ? undefined : [hue.id];
                          updateFilter(
                            {
                              colorFilter: {
                                ...localFilter.colorFilter,
                                hueCategories: nextCategories,
                                similarityThreshold: nextCategories
                                  ? localFilter.colorFilter?.similarityThreshold
                                  : undefined,
                                // カスタムカラーは排他
                                customColor: undefined,
                              },
                            },
                            true
                          );
                        }}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all duration-200 flex-shrink-0',
                          isSelected
                            ? 'border-gray-800 ring-2 ring-primary ring-offset-1'
                            : 'border-gray-300 hover:border-gray-400'
                        )}
                        style={{ backgroundColor: hue.color }}
                        title={hue.name}
                      />
                    );
                  })}

                  {/* Custom Color Circle */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter(
                          {
                            colorFilter: {
                              ...localFilter.colorFilter,
                              customColor: customColor,
                              // 他の色選択をクリア
                              hueCategories: undefined,
                              similarityThreshold: undefined,
                            },
                          },
                          true
                        );
                      }}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-all duration-200 flex-shrink-0',
                        localFilter.colorFilter?.customColor
                          ? 'border-gray-800 ring-2 ring-primary ring-offset-1'
                          : 'border-gray-300 hover:border-gray-400'
                      )}
                      style={{ backgroundColor: customColor }}
                      title={t.filter.customColor}
                    />
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => {
                        const newColor = e.target.value;
                        setCustomColor(newColor);
                        // カラーが変更された時に自動的にフィルターを適用
                        updateFilter(
                          {
                            colorFilter: {
                              ...localFilter.colorFilter,
                              customColor: newColor,
                              // 他の色選択をクリア
                              hueCategories: undefined,
                              similarityThreshold: undefined,
                            },
                          },
                          true
                        );
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title={t.filter.selectCustomColor}
                    />
                  </div>
                </div>
                {hasHueSelection && (
                  <div className="flex items-center gap-2 pt-1 text-xs text-gray-600">
                    <span className="shrink-0">{t.filter.match}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={colorSimilarityThreshold}
                      onChange={(event) =>
                        updateColorSimilarityThreshold(Number(event.currentTarget.value))
                      }
                      className="flex-1 accent-primary"
                    />
                    <span className="tabular-nums w-8 text-right">{colorSimilarityThreshold}</span>
                  </div>
                )}
              </div>

              {/* Clear Color Filter */}
              {(localFilter.colorFilter?.hueCategories?.length ||
                localFilter.colorFilter?.tonePoint ||
                localFilter.colorFilter?.toneSaturation !== undefined ||
                localFilter.colorFilter?.toneLightness !== undefined ||
                localFilter.colorFilter?.similarityThreshold ||
                localFilter.colorFilter?.customColor) && (
                <button
                  type="button"
                  onClick={() => {
                    updateFilter({ colorFilter: undefined }, true);
                  }}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  {t.filter.clearColorFilters}
                </button>
              )}
            </div>

            {/* Media Category */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Monitor size={16} />
                {t.filter.mediaCategory}
              </label>
              <Select
                value={localFilter.mediaCategory || 'all'}
                onValueChange={(value) =>
                  updateFilter(
                    {
                      mediaCategory: value === 'all' ? undefined : (value as MediaCategory),
                    },
                    true
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.filter.allCategories}</SelectItem>
                  <SelectItem value="image">{t.sidebar.images}</SelectItem>
                  <SelectItem value="comic">{t.sidebar.comics}</SelectItem>
                  <SelectItem value="video">{t.sidebar.videos}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Media Type */}
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-2 text-sm font-medium text-gray-700">
                <span className="flex items-center gap-2">
                  <Images size={16} />
                  {t.filter.mediaType}
                </span>
                {selectedMediaTypes.length === 0 ? (
                  <span className="text-[11px] font-normal text-gray-400">{t.filter.allTypes}</span>
                ) : (
                  <button
                    type="button"
                    onClick={clearMediaTypeSelection}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {t.filter.allTypes}
                  </button>
                )}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MEDIA_TYPE_OPTIONS.map((option) => {
                  const isSelected = selectedMediaTypes.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => updateMediaTypeSelection(option.value, !isSelected)}
                      className={cn(
                        FILTER_CHOICE_BUTTON_CLASS,
                        'min-w-0 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                        isSelected
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      {mediaTypeLabels[option.value]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sort Options */}
            {onSortChange && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <ArrowUpDown size={16} />
                  {t.filter.sortByLabel}
                </label>
                <div className="flex items-center gap-2">
                  <Select value={sortField} onValueChange={updateSortField}>
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">{t.filter.recommended}</SelectItem>
                      <SelectItem value="dateAdded">{t.filter.dateAdded}</SelectItem>
                      <SelectItem value="name">{t.filter.name}</SelectItem>
                      <SelectItem value="likes">{t.filter.mostLiked}</SelectItem>
                      <SelectItem value="updated">{t.filter.recentlyUpdated}</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={toggleSortOrder}
                    aria-label={sortOrderLabel}
                    aria-pressed={sortOrder === 'desc'}
                    title={sortOrderLabel}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                      sortOrder === 'desc'
                        ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                    )}
                  >
                    <ArrowDown
                      size={15}
                      className={cn('transition-transform', sortOrder === 'asc' && 'rotate-180')}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {hasActiveFilters ? (
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full" />
                    {t.filter.filtersActive}
                  </span>
                ) : (
                  <span>{t.filter.noFiltersApplied}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isSmartCollection && hasFilterChanges && (
                  <Button
                    size="sm"
                    onClick={handleUpdateSmartCollection}
                    disabled={isUpdatingSmartCollection}
                  >
                    {isUpdatingSmartCollection ? t.filter.applying : t.filter.apply}
                  </Button>
                )}
                {hasActiveFilters && datasetId && !isSmartCollection && (
                  <Dialog
                    open={isSmartCollectionDialogOpen}
                    onOpenChange={setIsSmartCollectionDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" className="flex items-center gap-1">
                        <PlusCircle size={16} />
                        {t.filter.create}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>{t.filter.createSmartCollectionTitle}</DialogTitle>
                        <DialogDescription>{t.filter.createSmartCollectionDesc}</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="collection-name">{t.filter.collectionName}</Label>
                          <Input
                            id="collection-name"
                            value={smartCollectionName}
                            onChange={(e) => setSmartCollectionName(e.target.value)}
                            placeholder={t.filter.naturalLanguagePlaceholder}
                            disabled={isCreatingSmartCollection}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsSmartCollectionDialogOpen(false);
                            setSmartCollectionName('');
                          }}
                          disabled={isCreatingSmartCollection}
                        >
                          {t.common.cancel}
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!smartCollectionName.trim()) return;

                            setIsCreatingSmartCollection(true);
                            try {
                              // Convert UI filter to API filter format
                              const filterConfig = convertFilterToConfig(localFilter);

                              await apiClient.createCollection({
                                name: smartCollectionName,
                                type: 'SMART',
                                dataSetId: Number(datasetId),
                                filterConfig,
                                icon: '⚙️',
                              });

                              setIsSmartCollectionDialogOpen(false);
                              setSmartCollectionName('');
                              // Invalidate collections query to refresh sidebar
                              queryClient.invalidateQueries({ queryKey: ['collection-folders'] });
                            } catch (error) {
                              console.error('Error creating smart collection:', error);
                              // TODO: Show error toast instead of alert
                            } finally {
                              setIsCreatingSmartCollection(false);
                            }
                          }}
                          disabled={!smartCollectionName.trim() || isCreatingSmartCollection}
                        >
                          {isCreatingSmartCollection ? t.common.creating : t.common.create}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default memo(FilterPanel);
