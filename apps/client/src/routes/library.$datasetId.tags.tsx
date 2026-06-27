import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { Edit2, GitMerge, Info, Loader2, Tag, Trash2, X } from 'lucide-react';
import MersenneTwister from 'mersenne-twister';
import {
  type MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
// moved React hooks import above; see lazy import note
import { createPortal } from 'react-dom';
import type { EditUpdates } from '@/components/BulkEditPanel';
import BulkEditPanel from '@/components/BulkEditPanel';
import FilterPanel from '@/components/FilterPanel';
import InfoSidebar from '@/components/InfoSidebar';
import { StackTileGrid } from '@/components/StackTileGrid';
import { Button } from '@/components/ui/button';
import { SmallSearchField, SmallSelect } from '@/components/ui/Controls';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HeaderIconButton } from '@/components/ui/Header/HeaderIconButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SelectionActionBar } from '@/components/ui/selection-action-bar';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { useRightPanelPushesContent } from '@/hooks/useSidebarLayoutMode';
import { useStackTile } from '@/hooks/useStackTile';
import { apiClient } from '@/lib/api-client';
import { downloadStackOriginals } from '@/lib/download-originals';
import { useT } from '@/lib/i18n';
import { createStackSelectionActions } from '@/lib/stack-selection-actions';
import { cn } from '@/lib/utils';
import {
  currentFilterAtom,
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
} from '@/stores/ui';
import { genListToken, saveViewContext } from '@/stores/view-context';
import type { ColorFilter, MediaCategory, MediaType, StackFilter } from '@/types';

interface TagsSearch {
  tagId?: string;
}

export const Route = createFileRoute('/library/$datasetId/tags')({
  validateSearch: (search: Record<string, unknown>): TagsSearch => ({
    tagId: typeof search.tagId === 'string' ? search.tagId : undefined,
  }),
  component: TagsPage,
});

interface TagItem {
  id: number;
  title: string;
  stackCount: number;
  dataSetId: number;
}

interface TagsResponse {
  tags: TagItem[];
  total: number;
  limit: number;
  offset: number;
}

interface StackItem {
  id: string | number;
  name: string;
  title?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  liked?: number;
  likeCount?: number;
  favorited?: boolean;
  isFavorite?: boolean;
  mediaType?: MediaCategory;
  actualMediaType?: MediaType;
  author?: string | { id: string | number; name: string };
  tags?: Array<string | { name?: string; title?: string }>;
  assetCount?: number;
  assetsCount?: number;
  _count?: { assets: number };
}

interface BulkEditItem {
  id: string | number;
  tags?: string[];
  author?: string;
}

interface TagStacksQueryParams {
  dataSetId: number;
  limit: number;
  offset: number;
  tag: string[];
  mediaCategory?: MediaCategory;
  mediaTypes?: MediaType[];
  author?: string[];
  fav?: 0 | 1;
  liked?: 0 | 1;
  search?: string;
  hasNoTags?: boolean;
  hasNoAuthor?: boolean;
  hueCategories?: string[];
  toneSaturation?: number;
  toneLightness?: number;
  toneTolerance?: number;
  similarityThreshold?: number;
  customColor?: string;
}

function appendColorFilterParams(params: TagStacksQueryParams, colorFilter?: ColorFilter): void {
  if (!colorFilter) return;
  if (colorFilter.hueCategories?.length) params.hueCategories = colorFilter.hueCategories;
  if (colorFilter.toneSaturation !== undefined) params.toneSaturation = colorFilter.toneSaturation;
  if (colorFilter.toneLightness !== undefined) params.toneLightness = colorFilter.toneLightness;
  if (colorFilter.toneTolerance !== undefined) params.toneTolerance = colorFilter.toneTolerance;
  if (colorFilter.similarityThreshold !== undefined) {
    params.similarityThreshold = colorFilter.similarityThreshold;
  }
  if (colorFilter.customColor) params.customColor = colorFilter.customColor;
}

function buildTagStacksQuery(params: {
  datasetId: string;
  selectedTag: TagItem;
  filter: StackFilter;
  limit: number;
  offset: number;
}): TagStacksQueryParams {
  const query: TagStacksQueryParams = {
    dataSetId: Number(params.datasetId),
    limit: params.limit,
    offset: params.offset,
    tag: [params.selectedTag.title],
  };

  if (params.filter.mediaCategory) query.mediaCategory = params.filter.mediaCategory;
  if (params.filter.mediaTypes?.length) query.mediaTypes = params.filter.mediaTypes;
  if (params.filter.tags && params.filter.tags.length > 0) {
    const extras = params.filter.tags.filter((tag) => tag !== params.selectedTag.title);
    if (extras.length > 0) query.tag = [...query.tag, ...extras];
  }
  if (params.filter.authors && params.filter.authors.length > 0) {
    query.author = params.filter.authors;
  }
  if (params.filter.isFavorite === true) query.fav = 1;
  if (params.filter.isFavorite === false) query.fav = 0;
  if (params.filter.isLiked === true) query.liked = 1;
  if (params.filter.isLiked === false) query.liked = 0;
  if (params.filter.search) query.search = params.filter.search;
  if (params.filter.hasNoTags !== undefined) query.hasNoTags = params.filter.hasNoTags;
  if (params.filter.hasNoAuthor !== undefined) query.hasNoAuthor = params.filter.hasNoAuthor;
  appendColorFilterParams(query, params.filter.colorFilter);

  return query;
}

function toNumericId(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function isMediaCategory(value: unknown): value is MediaCategory {
  return value === 'image' || value === 'comic' || value === 'video';
}

function getStackTagNames(tags: StackItem['tags']): string[] | undefined {
  if (!tags) return undefined;
  const names = tags
    .map((tag) => (typeof tag === 'string' ? tag : tag.title || tag.name || ''))
    .filter((tag) => tag.length > 0);
  return names.length > 0 ? names : undefined;
}

function getStackAuthorName(author: StackItem['author']): string | undefined {
  return typeof author === 'string' ? author : author?.name;
}

function toBulkEditItem(stack: StackItem): BulkEditItem {
  return {
    id: stack.id,
    tags: getStackTagNames(stack.tags),
    author: getStackAuthorName(stack.author),
  };
}

function TagsPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const tagSearch = Route.useSearch();
  const { datasetId } = Route.useParams();
  const { onOpen, onFindSimilar, onAddToScratch, onDownload, onToggleFavorite, onLike, dragProps } =
    useStackTile(datasetId);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<TagItem | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'title-asc' | 'title-desc' | 'count-desc' | 'count-asc'>(
    'count-desc'
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Info panel and selection mode states
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const routeFilterScopeKey = useMemo(() => `tags:${datasetId}`, [datasetId]);
  const [filterScopeKey, setFilterScopeKey] = useState<string | null>(null);
  const tagsPageFilter = useMemo<StackFilter>(() => ({ datasetId }), [datasetId]);
  const effectiveFilter = filterScopeKey === routeFilterScopeKey ? currentFilter : tagsPageFilter;
  const [selectedStackItems, setSelectedStackItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const rightPanelPushesContent = useRightPanelPushesContent(
    (!selectionMode && infoSidebarOpen) || (selectionMode && isEditPanelOpen)
  );

  // Stabilize body scrollbar gutter while this page is active
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('list-stable-body');
      return () => {
        document.body.classList.remove('list-stable-body');
      };
    }
  }, []);

  // Fetch tags
  const {
    data: tagsData,
    isLoading: tagsLoading,
    error: tagsError,
    refetch: refetchTags,
  } = useQuery<TagsResponse>({
    queryKey: ['tags', datasetId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/v1/tags/management?limit=1000&offset=0&dataSetId=${datasetId}`
      );
      return response.data;
    },
    // 再入場時の空表示防止: 毎回確実に取得し、フォーカス時の無駄な再取得は抑制
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const resetTagsPageState = useCallback(() => {
    setFilterScopeKey(routeFilterScopeKey);
    setSelectedTag(null);
    setSelectedTags(new Set());
    setSearchQuery('');
    setIsEditPanelOpen(false);
    setSelectionMode(false);
    setCurrentFilter(tagsPageFilter);
    void refetchTags();
  }, [refetchTags, routeFilterScopeKey, setCurrentFilter, setSelectionMode, tagsPageFilter]);

  // ルート入場時に、他ページから持ち越された mediaType などのフィルタを切り離す
  useEffect(() => {
    resetTagsPageState();
  }, [resetTagsPageState]);

  // このルートが保持されたまま再入場した場合も同じ初期化を行う
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const isTagsPath = location.pathname.includes(`/library/${datasetId}/tags`);
    if (isTagsPath && prevPathRef.current !== location.pathname) {
      resetTagsPageState();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, datasetId, resetTagsPageState]);

  // Filter and sort tags
  const filteredTags = useMemo(() => {
    if (!tagsData?.tags) return [];

    let tags = tagsData.tags;

    // Filter by search query
    if (searchQuery) {
      tags = tags.filter((tag) => tag.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Sort tags
    const sorted = [...tags];
    switch (sortBy) {
      case 'title-asc':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'title-desc':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'count-desc':
        sorted.sort((a, b) => b.stackCount - a.stackCount);
        break;
      case 'count-asc':
        sorted.sort((a, b) => a.stackCount - b.stackCount);
        break;
    }

    return sorted;
  }, [tagsData?.tags, searchQuery, sortBy]);

  // Build a stable filter key to drive refetches (avoid object identity pitfalls)
  const filterKey = useMemo(() => {
    const f = effectiveFilter;
    const key = {
      mediaCategory: f.mediaCategory ?? undefined,
      search: f.search ?? undefined,
      tags: Array.isArray(f.tags) ? [...f.tags] : undefined,
      authors: Array.isArray(f.authors) ? [...f.authors] : undefined,
      isFavorite: f.isFavorite ?? undefined,
      isLiked: f.isLiked ?? undefined,
      hasNoTags: f.hasNoTags ?? undefined,
      hasNoAuthor: f.hasNoAuthor ?? undefined,
      colorFilter: f.colorFilter
        ? {
            hueCategories: f.colorFilter.hueCategories ?? undefined,
            toneSaturation: f.colorFilter.toneSaturation ?? undefined,
            toneLightness: f.colorFilter.toneLightness ?? undefined,
            toneTolerance: f.colorFilter.toneTolerance ?? undefined,
            similarityThreshold: f.colorFilter.similarityThreshold ?? undefined,
            customColor: f.colorFilter.customColor ?? undefined,
          }
        : undefined,
    };
    return JSON.stringify(key);
  }, [effectiveFilter]);

  // Fetch stacks for selected tag
  const {
    data: stacksData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['tag-stacks', selectedTag?.id, datasetId, filterKey],
    queryFn: async ({ pageParam = 0 }) => {
      if (!selectedTag) return { stacks: [], total: 0, limit: 50, offset: 0 };

      // Compose unified filter params honoring the tags page filter and including the selected tag
      const qp = buildTagStacksQuery({
        datasetId,
        selectedTag,
        filter: effectiveFilter,
        limit: 50,
        offset: pageParam,
      });

      const res = await apiClient.getStacksWithFilters(qp);
      return {
        stacks: res.stacks,
        total: res.total,
        limit: res.limit,
        offset: res.offset,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: !!selectedTag,
    initialPageParam: 0,
  });

  const allStacks = useMemo(() => {
    return stacksData?.pages.flatMap((page) => page.stacks) || [];
  }, [stacksData]);

  const bulkEditItems = useMemo(
    () => allStacks.filter((stack) => selectedStackItems.has(stack.id)).map(toBulkEditItem),
    [allStacks, selectedStackItems]
  );
  const selectedStackIds = useMemo(
    () => allStacks.filter((stack) => selectedStackItems.has(stack.id)).map((stack) => stack.id),
    [allStacks, selectedStackItems]
  );

  // Shuffle: when a tag is selected, pick a random stack from that tag's full set
  const mtRef = useRef<MersenneTwister | null>(null);
  if (!mtRef.current) mtRef.current = new MersenneTwister();
  const handleShuffle = useCallback(async () => {
    if (!selectedTag) return;
    const total = stacksData?.pages?.[0]?.total || 0;
    if (total <= 0) return;
    const PAGE_SIZE = 50;
    const MAX = 0x100000000;
    const bound = MAX - (MAX % total);
    let r: number;
    do {
      r = mtRef.current!.random_int();
    } while (r >= bound);
    const targetIndex = r % total;
    const pageIndex = Math.floor(targetIndex / PAGE_SIZE);
    const withinPageIndex = targetIndex % PAGE_SIZE;
    // Fetch that page directly with current filters applied
    const qp = buildTagStacksQuery({
      datasetId,
      selectedTag,
      filter: effectiveFilter,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });
    const page = await apiClient.getStacksWithFilters(qp);
    const item = page?.stacks?.[withinPageIndex];
    if (!item) return;
    const ids = (page.stacks || []).map((stack) => toNumericId(stack.id));
    const clickedId = toNumericId(item.id);
    const currentIndex = Math.max(
      0,
      ids.findIndex((id: number) => id === clickedId)
    );
    const selectedTagContextFilter: StackFilter = { tags: [String(selectedTag.id)] };
    const token = genListToken({
      datasetId: String(selectedTag.dataSetId),
      mediaType: item.mediaType,
      filters: selectedTagContextFilter,
    });
    saveViewContext({
      token,
      datasetId: String(selectedTag.dataSetId),
      mediaType: item.mediaType,
      filters: selectedTagContextFilter,
      ids,
      currentIndex,
      createdAt: Date.now(),
    });
    navigate({
      to: '/library/$datasetId/stacks/$stackId',
      params: { datasetId: String(selectedTag.dataSetId), stackId: String(item.id) },
      search: { page: 0, mediaType: item.mediaType, listToken: token },
      replace: true,
    });
  }, [selectedTag, stacksData, navigate, effectiveFilter, datasetId]);

  useHeaderActions({
    showShuffle: true,
    showFilter: true,
    showSelection: true,
    onShuffle: handleShuffle,
  });

  const selectedTagId = selectedTag?.id;
  const tagDataSetQuery = useMemo(
    () => new URLSearchParams({ dataSetId: datasetId }).toString(),
    [datasetId]
  );

  // Handle infinite scroll within the asset list pane
  useEffect(() => {
    if (selectedTagId == null) return;

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, selectedTagId]);

  // Mutations
  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const response = await apiClient.put(`/api/v1/tags/${id}/rename?${tagDataSetQuery}`, {
        title,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      setRenameDialogOpen(false);
      setSelectedTags(new Set());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => apiClient.delete(`/api/v1/tags/${id}?${tagDataSetQuery}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      setDeleteDialogOpen(false);
      setSelectedTags(new Set());
      if (selectedTag && selectedTags.has(selectedTag.id)) {
        setSelectedTag(null);
      }
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceIds, targetId }: { sourceIds: number[]; targetId: number }) => {
      const response = await apiClient.post(`/api/v1/tags/merge?${tagDataSetQuery}`, {
        sourceTagIds: sourceIds,
        targetTagId: targetId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      setMergeDialogOpen(false);
      setSelectedTags(new Set());
      if (selectedTag && selectedTags.has(selectedTag.id)) {
        setSelectedTag(null);
      }
    },
  });

  const handleTagClick = useCallback(
    (tag: TagItem) => {
      if (filterScopeKey !== routeFilterScopeKey) {
        setCurrentFilter(tagsPageFilter);
      }
      setFilterScopeKey(routeFilterScopeKey);
      // Always show stacks when clicking a tag
      setSelectedTag(tag);
      try {
        navigate({
          to: '/library/$datasetId/tags',
          params: { datasetId },
          search: { tagId: String(tag.id) },
        });
      } catch {}
    },
    [datasetId, filterScopeKey, navigate, routeFilterScopeKey, setCurrentFilter, tagsPageFilter]
  );

  const handleFilterChange = useCallback(
    (filter: StackFilter) => {
      setFilterScopeKey(routeFilterScopeKey);
      setCurrentFilter({ ...filter, datasetId });
    },
    [datasetId, routeFilterScopeKey, setCurrentFilter]
  );

  const handleTagSelect = (tag: TagItem, checked: boolean) => {
    const newSelected = new Set(selectedTags);
    if (checked) {
      newSelected.add(tag.id);
    } else {
      newSelected.delete(tag.id);
    }
    setSelectedTags(newSelected);
  };

  const handleRename = () => {
    // If only one tag is selected in checkbox, use that
    if (selectedTags.size === 1) {
      const tagId = Array.from(selectedTags)[0];
      const tag = filteredTags.find((t) => t.id === tagId);
      if (tag) {
        setNewTitle(tag.title);
        setRenameDialogOpen(true);
      }
    }
    // If a tag is selected (clicked) and no checkboxes are selected, use the selected tag
    else if (selectedTag && selectedTags.size === 0) {
      setNewTitle(selectedTag.title);
      setRenameDialogOpen(true);
    }
  };

  const handleDelete = () => {
    if (selectedTags.size === 0) return;
    setDeleteDialogOpen(true);
  };

  const handleMerge = () => {
    if (selectedTags.size < 2) return;
    setMergeTargetId(null);
    setMergeDialogOpen(true);
  };

  const confirmRename = () => {
    // Determine which tag to rename
    let tagId: number | undefined;

    if (selectedTags.size === 1) {
      tagId = Array.from(selectedTags)[0];
    } else if (selectedTag && selectedTags.size === 0) {
      tagId = selectedTag.id;
    }

    if (tagId) {
      renameMutation.mutate({ id: tagId, title: newTitle });
    }
  };

  const confirmDelete = () => {
    deleteMutation.mutate(Array.from(selectedTags));
  };

  const confirmMerge = () => {
    if (!mergeTargetId) return;
    const sourceIds = Array.from(selectedTags).filter((id) => id !== mergeTargetId);
    mergeMutation.mutate({ sourceIds, targetId: mergeTargetId });
  };

  // Stack selection helpers
  const handleStackItemSelect = useCallback((itemId: string | number) => {
    setSelectedStackItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  // Restore selected tag from URL when navigating back/forward
  useEffect(() => {
    try {
      const idStr = tagSearch.tagId;
      if (idStr && tagsData?.tags) {
        const id = Number(idStr);
        const found = (tagsData.tags || []).find((t) => t.id === id) || null;
        setSelectedTag(found);
      }
      if (!idStr) setSelectedTag(null);
    } catch {}
  }, [tagSearch.tagId, tagsData]);

  const closeInfoSidebarBeforeSelection = useCallback(() => {
    if (infoSidebarOpen) {
      setInfoSidebarOpen(false);
    }
  }, [infoSidebarOpen, setInfoSidebarOpen]);

  const enterSelectionModeWithStack = useCallback(
    (stackId: string | number) => {
      setSelectionMode(true);
      setSelectedStackItems(new Set([stackId]));
    },
    [setSelectionMode]
  );

  const selectStackRange = useCallback((stackIds: Array<string | number>) => {
    setSelectedStackItems((current) => {
      const next = new Set(current);
      for (const stackId of stackIds) {
        next.add(stackId);
      }
      return next;
    });
  }, []);

  const openStackFromTile = useCallback(
    (stack: StackItem, event: MouseEvent<HTMLDivElement>) => {
      if (infoSidebarOpen) {
        event.preventDefault();
        setSelectedItemId(stack.id);
        setInfoSidebarOpen(true);
        return;
      }

      event.preventDefault();
      const ids = (allStacks || []).map((s) => toNumericId(s.id));
      const clickedId = toNumericId(stack.id);
      const currentIndex = Math.max(0, ids.indexOf(clickedId));

      const mediaType = isMediaCategory(stack.mediaType) ? stack.mediaType : undefined;
      const selectedTagContextFilter: StackFilter = selectedTag
        ? { tags: [String(selectedTag.id)] }
        : {};
      const token = genListToken({
        datasetId,
        mediaType,
        filters: selectedTagContextFilter,
      });
      saveViewContext({
        token,
        datasetId,
        mediaType,
        filters: selectedTagContextFilter,
        ids,
        currentIndex,
        createdAt: Date.now(),
      });

      navigate({
        to: '/library/$datasetId/stacks/$stackId',
        params: { datasetId, stackId: String(stack.id) },
        search: { page: 0, mediaType, listToken: token },
      });
    },
    [
      allStacks,
      datasetId,
      infoSidebarOpen,
      navigate,
      selectedTag,
      setInfoSidebarOpen,
      setSelectedItemId,
    ]
  );

  const getStackLinkElement = useCallback(
    (stack: StackItem) => (
      <Link
        to="/library/$datasetId/stacks/$stackId"
        params={{ datasetId, stackId: String(stack.id) }}
      />
    ),
    [datasetId]
  );

  const handleOpenStack = useCallback(
    async (stack: StackItem) => {
      await onOpen(stack.id);
    },
    [onOpen]
  );

  const handleInfoStack = useCallback(
    (stack: StackItem) => {
      setSelectedItemId(stack.id);
      setInfoSidebarOpen(true);
    },
    [setInfoSidebarOpen, setSelectedItemId]
  );

  const handleFindSimilarStack = useCallback(
    async (stack: StackItem) => {
      await onFindSimilar(stack.id);
    },
    [onFindSimilar]
  );

  const handleAddToScratchStack = useCallback(
    async (stack: StackItem) => {
      await onAddToScratch(stack.id);
    },
    [onAddToScratch]
  );

  const handleDownloadStack = useCallback(
    (stack: StackItem) => {
      onDownload(stack.id);
    },
    [onDownload]
  );

  const handleToggleFavoriteStack = useCallback(
    async (stack: StackItem, favorited: boolean) => {
      await onToggleFavorite(stack.id, favorited);
    },
    [onToggleFavorite]
  );

  const handleLikeStack = useCallback(
    async (stack: StackItem) => {
      await onLike(stack.id);
    },
    [onLike]
  );

  const getStackDragHandlers = useCallback(
    (stack: StackItem, sourceImageUrl: string | null, sourceImageFilename: string | undefined) =>
      dragProps(stack.id, sourceImageUrl, sourceImageFilename),
    [dragProps]
  );

  const clearStackSelection = useCallback(() => {
    setSelectedStackItems(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearStackSelection();
    setIsEditPanelOpen(false);
  }, [clearStackSelection, setSelectionMode]);

  useEffect(() => {
    exitSelectionMode();
  }, [exitSelectionMode]);

  // Edit panel handlers
  const toggleEditPanel = useCallback(() => {
    if (selectedStackItems.size === 0) return;
    setIsEditPanelOpen((prev) => {
      const next = !prev;
      if (next) setInfoSidebarOpen(false);
      return next;
    });
  }, [selectedStackItems.size, setInfoSidebarOpen]);

  const closeEditPanel = useCallback(() => {
    setIsEditPanelOpen(false);
  }, []);

  const applyEditUpdates = useCallback(
    async (updates: EditUpdates) => {
      if (selectedStackItems.size === 0) return;

      try {
        const stackIds = Array.from(selectedStackItems).map((id) =>
          typeof id === 'string' ? Number.parseInt(id, 10) : id
        );

        // Apply tags
        if (updates.addTags && updates.addTags.length > 0) {
          await apiClient.bulkAddTags(stackIds, updates.addTags);
        }

        // Apply author
        if (updates.setAuthor) {
          await apiClient.bulkSetAuthor(stackIds, updates.setAuthor);
        }

        // Apply media type
        if (updates.setMediaType) {
          await apiClient.bulkSetMediaType(stackIds, updates.setMediaType);
        }

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['tag-stacks', selectedTag?.id] });

        exitSelectionMode();
      } catch (error) {
        console.error('Error applying bulk updates:', error);
      }
    },
    [selectedStackItems, queryClient, selectedTag, exitSelectionMode]
  );

  // Bulk operations handlers
  const refreshStacks = useCallback(
    async (stackIds: (string | number)[]) => {
      if (stackIds.length === 0) return;
      await apiClient.refreshStacks(stackIds);
      queryClient.invalidateQueries({ queryKey: ['tag-stacks', selectedTag?.id] });
    },
    [queryClient, selectedTag]
  );

  const handleRefreshStacks = useCallback(
    async (targetStackIds?: Array<string | number>) => {
      const stackIds = targetStackIds ?? Array.from(selectedStackItems);
      try {
        await refreshStacks(stackIds);
        exitSelectionMode();
      } catch (error) {
        console.error('Error refreshing stacks:', error);
      }
    },
    [selectedStackItems, refreshStacks, exitSelectionMode]
  );

  const removeStacks = useCallback(
    async (stackIds: (string | number)[]) => {
      if (stackIds.length === 0) return;
      await apiClient.bulkRemoveStacks(stackIds);
      queryClient.invalidateQueries({ queryKey: ['tag-stacks', selectedTag?.id] });
    },
    [queryClient, selectedTag]
  );

  const handleRemoveStacks = useCallback(async () => {
    if (selectedStackItems.size === 0) return;

    const stackIds = Array.from(selectedStackItems);

    try {
      await removeStacks(stackIds);
      exitSelectionMode();
    } catch (error) {
      console.error('Error removing stacks:', error);
    }
  }, [selectedStackItems, removeStacks, exitSelectionMode]);

  const handleDownloadSelectedStacks = useCallback(() => {
    if (selectedStackIds.length === 0) return;
    downloadStackOriginals(datasetId, selectedStackIds);
  }, [datasetId, selectedStackIds]);

  const selectionActions = useMemo(
    () =>
      createStackSelectionActions({
        selectedCount: selectedStackItems.size,
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
        refresh: { onSelect: () => handleRefreshStacks() },
        deleteStacks: { onSelect: handleRemoveStacks },
      }),
    [
      handleDownloadSelectedStacks,
      handleRefreshStacks,
      handleRemoveStacks,
      selectedStackItems.size,
      t,
      toggleEditPanel,
    ]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'i':
          e.preventDefault();
          if (!infoSidebarOpen && selectionMode) {
            exitSelectionMode(); // Exit selection mode properly when opening info sidebar
          }
          setInfoSidebarOpen(!infoSidebarOpen);
          break;
        case 'Escape':
          if (selectionMode) {
            exitSelectionMode();
          } else if (isEditPanelOpen) {
            closeEditPanel();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    infoSidebarOpen,
    setInfoSidebarOpen,
    exitSelectionMode,
    isEditPanelOpen,
    closeEditPanel,
    selectionMode,
  ]);

  // This page uses its own layout
  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Tags List - Always visible */}
      <div className="w-80 h-full flex-shrink-0 border-r bg-white">
        <div className="h-full overflow-y-auto">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold mb-3">{t.sidebar.tags}</h2>

            <div className="space-y-3">
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
                  <SelectItem value="title-asc">{t.tagPage.nameAsc}</SelectItem>
                  <SelectItem value="title-desc">{t.tagPage.nameDesc}</SelectItem>
                  <SelectItem value="count-desc">{t.tagPage.stackCountDesc}</SelectItem>
                  <SelectItem value="count-asc">{t.tagPage.stackCountAsc}</SelectItem>
                </SmallSelect>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {selectedTags.size > 0
                      ? t.tagPage.selectedTags(selectedTags.size)
                      : t.tagPage.selectTagsPrompt}
                  </span>
                  {selectedTags.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setSelectedTags(new Set())}
                    >
                      {t.contextMenu.clear}
                    </Button>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRename}
                    disabled={selectedTags.size > 1 || (selectedTags.size === 0 && !selectedTag)}
                    className="h-7 px-2 text-xs flex-1"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    {t.contextMenu.rename}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMerge}
                    disabled={selectedTags.size < 2}
                    className="h-7 px-2 text-xs flex-1"
                  >
                    <GitMerge className="h-3 w-3 mr-1" />
                    {t.tagPage.mergeTags}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive border-destructive/50 hover:border-destructive"
                    onClick={handleDelete}
                    disabled={selectedTags.size === 0}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Tags list */}
          <div className="p-2">
            {tagsError ? (
              <div className="text-center py-8 text-red-500">
                {t.tagPage.errorLoadingTags} {(tagsError as Error).message}
              </div>
            ) : tagsLoading ? (
              <div className="text-center py-8 text-muted-foreground">{t.tagPage.loadingTags}</div>
            ) : filteredTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? t.tagPage.noTagsFound : t.tagPage.noTagsYet}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredTags.map((tag) => (
                  <div
                    key={tag.id}
                    onClick={() => handleTagClick(tag)}
                    className={cn(
                      'px-2 py-1.5 rounded transition-colors cursor-pointer group',
                      selectedTag?.id === tag.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Checkbox
                          checked={selectedTags.has(tag.id)}
                          onCheckedChange={(checked) => handleTagSelect(tag, checked as boolean)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3 w-3"
                        />
                        <span className="text-sm truncate font-medium">{tag.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {tag.stackCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Tag Details */}
      {selectedTag ? (
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
                <h2 className="text-2xl font-bold">{selectedTag.title}</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedTag(null);
                    try {
                      navigate({
                        to: '/library/$datasetId/tags',
                        params: { datasetId },
                        search: {},
                      });
                    } catch {}
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground mt-1">
                {t.tagPage.stackCount(stacksData?.pages[0]?.total || 0)}
              </p>
            </div>

            {/* Stacks with this tag */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">{t.tagPage.stacksWithThisTag}</h3>
              {allStacks.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  {t.tagPage.noStacksWithThisTag}
                </div>
              ) : (
                <>
                  <Suspense
                    fallback={
                      <div className="py-8 text-center text-muted-foreground">
                        {t.common.loading}
                      </div>
                    }
                  >
                    <StackTileGrid
                      items={allStacks}
                      datasetId={datasetId}
                      gridClassName="grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 list-stable"
                      cornerRadius="rounded"
                      isSelectionMode={selectionMode}
                      selectedItems={selectedStackItems}
                      selectedInfoItemId={selectedItemId}
                      selectedActionCount={selectedStackItems.size}
                      getLinkElement={infoSidebarOpen ? undefined : getStackLinkElement}
                      onClickItem={openStackFromTile}
                      onBeforeEnterSelectionMode={closeInfoSidebarBeforeSelection}
                      onEnterSelectionMode={enterSelectionModeWithStack}
                      onToggleSelection={handleStackItemSelect}
                      onSelectRange={selectStackRange}
                      onOpenItem={handleOpenStack}
                      onInfoItem={handleInfoStack}
                      onFindSimilarItem={handleFindSimilarStack}
                      onAddToScratchItem={handleAddToScratchStack}
                      onDownloadItem={handleDownloadStack}
                      onDownloadSelected={handleDownloadSelectedStacks}
                      onRefreshStacks={handleRefreshStacks}
                      onBulkEditSelected={toggleEditPanel}
                      onRemoveSelectedStacks={handleRemoveStacks}
                      onToggleFavoriteItem={handleToggleFavoriteStack}
                      onLikeItem={handleLikeStack}
                      getDragHandlers={getStackDragHandlers}
                    />
                  </Suspense>

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
            <p className="text-lg text-muted-foreground">{t.tagPage.selectTagPrompt}</p>
          </div>
        </div>
      )}

      {/* InfoSidebar - only show when not in selection mode */}
      {!selectionMode && <InfoSidebar />}

      {/* Selection Action Bar - only show when in selection mode */}
      {selectionMode && (
        <SelectionActionBar
          selectedCount={selectedStackItems.size}
          onClearSelection={clearStackSelection}
          onExitSelectionMode={exitSelectionMode}
          actions={selectionActions}
        />
      )}

      {/* BulkEditPanel - open via action bar Edit */}
      {isEditPanelOpen &&
        createPortal(
          <BulkEditPanel
            isOpen={isEditPanelOpen}
            selectedItems={selectedStackItems}
            onClose={closeEditPanel}
            onSave={applyEditUpdates}
            items={bulkEditItems}
          />,
          document.body
        )}

      {/* Portal for header actions */}
      {createPortal(
        <>
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

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tagPage.renameTag}</DialogTitle>
            <DialogDescription>{t.tagPage.renameTagDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-title">{t.tagPage.newTitle}</Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t.tagPage.enterNewTitle}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={confirmRename} disabled={!newTitle.trim()}>
              {t.contextMenu.rename}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tagPage.mergeTags}</DialogTitle>
            <DialogDescription>{t.tagPage.mergeTagsDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="merge-target">{t.tagPage.targetTag}</Label>
              <Select
                value={mergeTargetId?.toString() || ''}
                onValueChange={(value) => setMergeTargetId(Number.parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.tagPage.selectTargetTag} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(selectedTags).map((id) => {
                    const tag = filteredTags.find((t) => t.id === id);
                    return tag ? (
                      <SelectItem key={id} value={id.toString()}>
                        {tag.title} ({t.tagPage.stackCount(tag.stackCount)})
                      </SelectItem>
                    ) : null;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={confirmMerge} disabled={!mergeTargetId}>
              {t.tagPage.mergeTags}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tagPage.deleteTags}</DialogTitle>
            <DialogDescription>{t.tagPage.deleteTagsConfirm(selectedTags.size)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter panel to apply additional filters to selected tag's stacks */}
      <FilterPanel currentFilter={effectiveFilter} onFilterChange={handleFilterChange} />
    </div>
  );
}
