import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Slider} from '@/components/ui/slider';
import {SuggestInput} from '@/components/ui/suggest-input';
import {useDebounce} from '@/hooks/utils/useDebounce';
import {apiClient} from '@/lib/api-client';
import {cn} from '@/lib/utils';
import {customColorAtom, filterOpenAtom, selectionModeAtom} from '@/stores/ui';
import type {HueCategory, StackFilter} from '@/types';
import {useQueryClient} from '@tanstack/react-query';
import {useParams} from '@tanstack/react-router';
import {useAtom} from 'jotai';
import {
  ArrowUpDown,
  Calendar,
  Heart,
  Monitor,
  Palette,
  PlusCircle,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';

// 色味カテゴリの定義（7色、ブライト-ライト間のトーン）
const HUE_CATEGORIES: { id: HueCategory; name: string; color: string }[] = [
  {id: 'red', name: '赤', color: '#FF8888'},
  {id: 'orange', name: 'オレンジ', color: '#FFB366'},
  {id: 'yellow', name: '黄', color: '#FFE066'},
  {id: 'green', name: '緑', color: '#66DD66'},
  {id: 'cyan', name: 'シアン', color: '#66CCFF'},
  {id: 'blue', name: '青', color: '#6699FF'},
  {id: 'violet', name: '紫', color: '#BB66FF'},
];

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

export default function FilterPanel({
  currentFilter,
  currentSort,
  onFilterChange,
  onSortChange,
  isSmartCollection = false,
  collectionId,
  originalFilterConfig,
  isFilterModified = false,
}: FilterPanelProps) {
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
  const debounceTimerRef = useRef<number | null>(null);
  // Ref for the Search input to focus when panel opens
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const params = useParams({strict: false});
  const datasetId = (params as { datasetId?: string }).datasetId;
  const queryClient = useQueryClient();

  // カラー類似度閾値状態
  const [colorSimilarityThreshold, setColorSimilarityThreshold] = useState(
    localFilter.colorFilter?.similarityThreshold || 85
  );

  // Smart collection dialog state
  const [isSmartCollectionDialogOpen, setIsSmartCollectionDialogOpen] = useState(false);
  const [smartCollectionName, setSmartCollectionName] = useState('');
  const [isCreatingSmartCollection, setIsCreatingSmartCollection] = useState(false);
  const [hasFilterChanges, setHasFilterChanges] = useState(false);
  const [isUpdatingSmartCollection, setIsUpdatingSmartCollection] = useState(false);
  // Composition state for Search input (avoid interfering with IME)
  const searchIsComposingRef = useRef(false);
  const panelRootRef = useRef<HTMLDivElement | null>(null);

  // デバウンスされた類似度閾値更新
  const debouncedSimilarityUpdate = useDebounce((threshold: number) => {
    updateFilter(
      {
        colorFilter: {
          ...localFilter.colorFilter,
          similarityThreshold: threshold,
        },
      },
      true
    );
  }, 150);

  // Update local filter when props change
  useEffect(() => {
    setLocalFilter(currentFilter);
    setColorSimilarityThreshold(currentFilter.colorFilter?.similarityThreshold || 85);
  }, [currentFilter]);

  // Check for filter changes in smart collection
  useEffect(() => {
    if (isSmartCollection && originalFilterConfig) {
      const currentConfig = convertFilterToConfig(localFilter);
      const hasChanges = JSON.stringify(currentConfig) !== JSON.stringify(originalFilterConfig);
      setHasFilterChanges(hasChanges);
    }
  }, [localFilter, isSmartCollection, originalFilterConfig]);

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
        const activeInsidePanel = !!(active && root && active.closest('[data-filter-panel-root="true"]') === root);
        // Only auto-focus when nothing else inside the panel is focused
        if (!activeInsidePanel || active === document.body) {
          searchInputRef.current?.focus({ preventScroll: true });
        }
      }, 320);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Create debounced filter change handler
  const debouncedFilterChange = useCallback(
    (filter: StackFilter) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(() => {
        onFilterChange(filter);
      }, 300); // 300ms debounce
    },
    [onFilterChange]
  );

  // Apply filter changes with debouncing for text inputs
  const updateFilter = useCallback(
    (updates: Partial<StackFilter>, immediate = false) => {
      const newFilter = {...localFilter, ...updates};
      setLocalFilter(newFilter);

      if (immediate) {
        onFilterChange(newFilter);
      } else {
        debouncedFilterChange(newFilter);
      }
    },
    [localFilter, onFilterChange, debouncedFilterChange]
  );

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
      if (originalFilterConfig.mediaType) restoredFilter.mediaType = originalFilterConfig.mediaType;
      if (originalFilterConfig.colorFilter)
        restoredFilter.colorFilter = originalFilterConfig.colorFilter;

      setLocalFilter(restoredFilter);
      onFilterChange(restoredFilter);
    } else {
      // For regular views and manual collections, clear all filters
      const {datasetId, mediaType} = localFilter;
      const clearedFilter = {datasetId, mediaType};
      setLocalFilter(clearedFilter);
      onFilterChange(clearedFilter);
    }
  };

  const hasActiveFilters =
    isSmartCollection && isFilterModified
      ? true // For smart collections, show "Clear all" when filter is modified
      : Object.keys(localFilter).some(
        (key) =>
          key !== 'datasetId' && key !== 'mediaType' && localFilter[key as keyof StackFilter]
      );

  // Convert filter to config format
  const convertFilterToConfig = (filter: StackFilter): Record<string, any> => {
    const config: any = {};

    if (filter.search) config.search = filter.search;
    if (filter.isFavorite !== undefined) config.favorited = filter.isFavorite;
    if (filter.isLiked !== undefined) config.liked = filter.isLiked;
    if (filter.tags) config.tagIds = filter.tags;
    if (filter.authors) config.authorNames = filter.authors;
    if (filter.hasNoTags) config.hasNoTags = filter.hasNoTags;
    if (filter.hasNoAuthor) config.hasNoAuthor = filter.hasNoAuthor;
    if (filter.mediaType) config.mediaType = filter.mediaType;
    if (filter.colorFilter) config.colorFilter = filter.colorFilter;

    return config;
  };

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
      queryClient.invalidateQueries({queryKey: ['collection', collectionId]});
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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
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
        ref={panelRootRef}
        data-filter-panel-root="true"
        className={cn(
          'fixed top-16 right-4 h-[calc(100vh-5rem)] w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilter}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="Close filter panel"
              >
                <X size={20} className="text-gray-600"/>
              </button>
            </div>
          </div>

          {/* Filter Content */}
          <div className="flex-1 overflow-auto p-4 space-y-6 bg-gray-50">
            {/* Search */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Search size={16}/>
                Search
              </label>
              <input
                type="text"
                ref={searchInputRef}
                value={localFilter.search || ''}
                onChange={(e) => updateFilter({search: e.target.value || undefined})}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    if ((e as any).isComposing || (e.nativeEvent as any)?.isComposing || searchIsComposingRef.current) {
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
                placeholder="Search by name or description"
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Favorites */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Star size={16}/>
                Favorites
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter({isFavorite: undefined}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isFavorite === undefined
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({isFavorite: true}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isFavorite === true
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Favs
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({isFavorite: false}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isFavorite === false
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Not Favs
                </button>
              </div>
            </div>

            {/* Likes */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Heart size={16}/>
                Likes
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter({isLiked: undefined}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isLiked === undefined
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({isLiked: true}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isLiked === true
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Liked
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter({isLiked: false}, true)}
                  className={cn(
                    'px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    localFilter.isLiked === false
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Not Liked
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Tag size={16}/>
                Tags
              </label>
              <div className="space-y-2">
                {/* No Tags Filter */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localFilter.hasNoTags || false}
                    onChange={(e) =>
                      updateFilter({hasNoTags: e.target.checked ? true : undefined}, true)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">Show only items without tags</span>
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
                    placeholder="Type tag and press Enter"
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
                          <X size={12} className="ml-1"/>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500">Type tag and press Enter to add</p>
            </div>

            {/* Authors */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar size={16}/>
                Authors
              </label>
              <div className="space-y-2">
                {/* No Author Filter */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localFilter.hasNoAuthor || false}
                    onChange={(e) =>
                      updateFilter({hasNoAuthor: e.target.checked ? true : undefined}, true)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">Show only items without author</span>
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
                  placeholder="Search and select authors"
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
                        <X size={12} className="ml-1"/>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Search and select authors to add them as filters
              </p>
            </div>

            {/* Color Filter */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Palette size={16}/>
                Color Filter
              </label>

              {/* Color Categories */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-600">色味 (Color)</div>
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
                                // 類似度は一旦無効化
                                similarityThreshold: undefined,
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
                        style={{backgroundColor: hue.color}}
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
                      style={{backgroundColor: customColor}}
                      title="カスタムカラー"
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
                      title="カスタムカラーを選択"
                    />
                  </div>
                </div>
                {/* Selected color badges */}
                {((localFilter.colorFilter?.hueCategories &&
                    localFilter.colorFilter.hueCategories.length > 0) ||
                  localFilter.colorFilter?.customColor) && (
                  <div className="flex flex-wrap gap-1">
                    {/* Hue category badges */}
                    {localFilter.colorFilter?.hueCategories?.map((categoryId) => {
                      const category = HUE_CATEGORIES.find((h) => h.id === categoryId);
                      return category ? (
                        <Badge
                          key={categoryId}
                          variant="secondary"
                          className="text-xs cursor-pointer bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-700 transition-colors"
                          onClick={() => {
                            const newCategories = undefined; // 単色モード: バッジクリックで解除
                            updateFilter(
                              {
                                colorFilter: {
                                  ...localFilter.colorFilter,
                                  hueCategories: newCategories,
                                  similarityThreshold: undefined,
                                },
                              },
                              true
                            );
                          }}
                        >
                          {category.name}
                          <X size={10} className="ml-1"/>
                        </Badge>
                      ) : null;
                    })}

                    {/* Custom color badge */}
                    {localFilter.colorFilter?.customColor && (
                      <Badge
                        variant="secondary"
                        className="text-xs cursor-pointer bg-gray-200 text-gray-700 hover:bg-red-100 hover:text-red-700 transition-colors flex items-center gap-1"
                        onClick={() => {
                          updateFilter(
                            {
                              colorFilter: {
                                ...localFilter.colorFilter,
                                customColor: undefined,
                                // カスタムカラーがなくなったら類似度閾値もクリア
                                similarityThreshold:
                                  localFilter.colorFilter?.hueCategories &&
                                  localFilter.colorFilter.hueCategories.length > 0
                                    ? localFilter.colorFilter?.similarityThreshold
                                    : undefined,
                              },
                            },
                            true
                          );
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full border border-gray-400"
                          style={{backgroundColor: localFilter.colorFilter.customColor}}
                        />
                        カスタム
                        <X size={10} className="ml-1"/>
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* 類似度は一時無効化中 */}

              {/* Clear Color Filter */}
              {(localFilter.colorFilter?.hueCategories?.length ||
                localFilter.colorFilter?.tonePoint ||
                localFilter.colorFilter?.similarityThreshold ||
                localFilter.colorFilter?.customColor) && (
                <button
                  type="button"
                  onClick={() => {
                    updateFilter({colorFilter: undefined}, true);
                    setColorSimilarityThreshold(85);
                  }}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  Clear color filters
                </button>
              )}
            </div>

            {/* Media Type */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Monitor size={16}/>
                Media Type
              </label>
              <Select
                value={localFilter.mediaType || 'all'}
                onValueChange={(value) =>
                  updateFilter(
                    {
                      mediaType:
                        value === 'all' ? undefined : (value as 'image' | 'comic' | 'video'),
                    },
                    true
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="comic">Comics</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Options */}
            {onSortChange && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <ArrowUpDown size={16}/>
                  Sort By
                </label>
                <div className="space-y-2">
                  <Select
                    value={currentSort?.field || 'recommended'}
                    onValueChange={(value) =>
                      onSortChange({field: value, order: currentSort?.order || 'desc'})
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue/>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="id">Date Added</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="liked">Most Liked</SelectItem>
                      <SelectItem value="updatedAt">Recently Updated</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange({field: currentSort?.field || 'recommended', order: 'asc'})
                      }
                      className={cn(
                        'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        currentSort?.order === 'asc'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      Ascending
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange({field: currentSort?.field || 'recommended', order: 'desc'})
                      }
                      className={cn(
                        'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        currentSort?.order === 'desc'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      Descending
                    </button>
                  </div>
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
                    <div className="w-2 h-2 bg-primary rounded-full"/>
                    Filters active
                  </span>
                ) : (
                  <span>No filters applied</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isSmartCollection && hasFilterChanges && (
                  <Button
                    size="sm"
                    onClick={handleUpdateSmartCollection}
                    disabled={isUpdatingSmartCollection}
                  >
                    {isUpdatingSmartCollection ? 'Applying...' : 'Apply'}
                  </Button>
                )}
                {hasActiveFilters && datasetId && !isSmartCollection && (
                  <Dialog
                    open={isSmartCollectionDialogOpen}
                    onOpenChange={setIsSmartCollectionDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" className="flex items-center gap-1">
                        <PlusCircle size={16}/>
                        Create
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>スマートコレクションを作成</DialogTitle>
                        <DialogDescription>
                          現在のフィルタ条件を保存して、スマートコレクションを作成します。
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="collection-name">コレクション名</Label>
                          <Input
                            id="collection-name"
                            value={smartCollectionName}
                            onChange={(e) => setSmartCollectionName(e.target.value)}
                            placeholder="例: お気に入りの青い画像"
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
                          キャンセル
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
                              queryClient.invalidateQueries({queryKey: ['collection-folders']});
                            } catch (error) {
                              console.error('Error creating smart collection:', error);
                              // TODO: Show error toast instead of alert
                            } finally {
                              setIsCreatingSmartCollection(false);
                            }
                          }}
                          disabled={!smartCollectionName.trim() || isCreatingSmartCollection}
                        >
                          {isCreatingSmartCollection ? '作成中...' : '作成'}
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
