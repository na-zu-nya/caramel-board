import type { EditUpdates } from '@/components/BulkEditPanel';
import BulkEditPanel from '@/components/BulkEditPanel';
import InfoSidebar from '@/components/InfoSidebar';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StackTile } from '@/components/ui/Stack';
import { useStackTile } from '@/hooks/useStackTile';
import { Button } from '@/components/ui/button';
import FilterPanel from '@/components/FilterPanel';
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
import { SmallSearchField, SmallSelect, SmallButton, Toolbar } from '@/components/ui/Controls';
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
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  infoSidebarOpenAtom,
  selectedItemIdAtom,
  selectionModeAtom,
  currentFilterAtom,
} from '@/stores/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useLocation, useNavigate, Link } from '@tanstack/react-router';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import MersenneTwister from 'mersenne-twister';
import { genListToken, saveViewContext } from '@/stores/view-context';
import { useAtom } from 'jotai';
import {
  Check,
  Clapperboard,
  Edit2,
  GitMerge,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
// moved React hooks import above; see lazy import note
import { createPortal } from 'react-dom';

export const Route = createFileRoute('/library/$datasetId/tags')({
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
  favorited?: boolean;
  mediaType?: string;
  author?: { id: number; name: string };
  assetCount?: number;
  _count?: { assets: number };
}

interface StacksResponse {
  stacks: StackItem[];
  total: number;
  limit: number;
  offset: number;
}

function TagsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { datasetId } = Route.useParams();
  const actions = useStackTile(datasetId);
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
  const [, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const [selectedStackItems, setSelectedStackItems] = useState<Set<string | number>>(new Set());
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);

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

  // ルート入場時（このパスに戻ってきた瞬間）にローカル状態をリセット＆再取得
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const isTagsPath = location.pathname.includes(`/library/${datasetId}/tags`);
    if (isTagsPath && prevPathRef.current !== location.pathname) {
      setSelectedTag(null);
      setSelectedTags(new Set());
      setSearchQuery('');
      setIsEditPanelOpen(false);
      setSelectionMode(false);
      // フィルタをこのページの初期状態にリセット（データセットのみ）
      setCurrentFilter({ datasetId });
      // タグ一覧を確実に更新
      void refetchTags();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, datasetId, refetchTags, setSelectionMode, setCurrentFilter]);

  // Ensure currentFilter carries dataset context (already reset above on path change)
  useEffect(() => {
    setCurrentFilter((prev) => ({ ...(prev || {}), datasetId }));
  }, [datasetId, setCurrentFilter]);

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
    const f = currentFilter || ({} as any);
    const key = {
      mediaType: f.mediaType ?? undefined,
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
  }, [currentFilter]);

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

      // Compose unified filter params honoring currentFilter and including the selected tag
      const qp: any = {
        dataSetId: Number(datasetId),
        limit: 50,
        offset: pageParam,
        tag: [selectedTag.title],
      };
      if (currentFilter.mediaType) qp.mediaType = currentFilter.mediaType;
      if (currentFilter.tags && currentFilter.tags.length > 0) {
        const extras = currentFilter.tags.filter((t) => t !== selectedTag.title);
        if (extras.length) qp.tag = [...qp.tag, ...extras];
      }
      if (currentFilter.authors && currentFilter.authors.length > 0)
        qp.author = currentFilter.authors;
      if (currentFilter.isFavorite === true) qp.fav = 1;
      if (currentFilter.isFavorite === false) qp.fav = 0;
      if (currentFilter.isLiked === true) qp.liked = 1;
      if (currentFilter.isLiked === false) qp.liked = 0;
      if (currentFilter.search) qp.search = currentFilter.search;
      if (currentFilter.hasNoTags !== undefined) qp.hasNoTags = currentFilter.hasNoTags;
      if (currentFilter.hasNoAuthor !== undefined) qp.hasNoAuthor = currentFilter.hasNoAuthor;
      if (currentFilter.colorFilter) {
        const cf = currentFilter.colorFilter as any;
        if (cf.hueCategories?.length) qp.hueCategories = cf.hueCategories;
        if (cf.toneSaturation !== undefined) qp.toneSaturation = cf.toneSaturation;
        if (cf.toneLightness !== undefined) qp.toneLightness = cf.toneLightness;
        if (cf.toneTolerance !== undefined) qp.toneTolerance = cf.toneTolerance;
        if (cf.similarityThreshold !== undefined) qp.similarityThreshold = cf.similarityThreshold;
        if (cf.customColor) qp.customColor = cf.customColor;
      }

      const res = await apiClient.getStacksWithFilters(qp);
      return {
        stacks: res.stacks as any[],
        total: res.total,
        limit: res.limit,
        offset: res.offset,
      } as StacksResponse;
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
    const qp: any = {
      dataSetId: Number(datasetId),
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
      tag: [selectedTag.title],
    };
    if (currentFilter.mediaType) qp.mediaType = currentFilter.mediaType;
    if (currentFilter.tags && currentFilter.tags.length > 0) {
      const extras = currentFilter.tags.filter((t) => t !== selectedTag.title);
      if (extras.length) qp.tag = [...qp.tag, ...extras];
    }
    if (currentFilter.authors && currentFilter.authors.length > 0)
      qp.author = currentFilter.authors;
    if (currentFilter.isFavorite === true) qp.fav = 1;
    if (currentFilter.isFavorite === false) qp.fav = 0;
    if (currentFilter.isLiked === true) qp.liked = 1;
    if (currentFilter.isLiked === false) qp.liked = 0;
    if (currentFilter.search) qp.search = currentFilter.search;
    if (currentFilter.hasNoTags !== undefined) qp.hasNoTags = currentFilter.hasNoTags;
    if (currentFilter.hasNoAuthor !== undefined) qp.hasNoAuthor = currentFilter.hasNoAuthor;
    if (currentFilter.colorFilter) {
      const cf = currentFilter.colorFilter as any;
      if (cf.hueCategories?.length) qp.hueCategories = cf.hueCategories;
      if (cf.toneSaturation !== undefined) qp.toneSaturation = cf.toneSaturation;
      if (cf.toneLightness !== undefined) qp.toneLightness = cf.toneLightness;
      if (cf.toneTolerance !== undefined) qp.toneTolerance = cf.toneTolerance;
      if (cf.similarityThreshold !== undefined) qp.similarityThreshold = cf.similarityThreshold;
      if (cf.customColor) qp.customColor = cf.customColor;
    }
    const page = await apiClient.getStacksWithFilters(qp);
    const item = page?.stacks?.[withinPageIndex];
    if (!item) return;
    const ids = (page.stacks || [])
      .map((s: any) => (typeof s.id === 'string' ? Number.parseInt(s.id, 10) : (s.id as number)))
      .reverse();
    const clickedId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : (item.id as number);
    const currentIndex = Math.max(
      0,
      ids.findIndex((id: number) => id === clickedId)
    );
    const token = genListToken({
      datasetId: String(selectedTag.dataSetId),
      mediaType: item.mediaType,
      filters: { tags: [String(selectedTag.id)] } as any,
    });
    saveViewContext({
      token,
      datasetId: String(selectedTag.dataSetId),
      mediaType: item.mediaType,
      filters: { tags: [String(selectedTag.id)] } as any,
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
  }, [selectedTag, stacksData, navigate]);

  useHeaderActions({
    showShuffle: true,
    showFilter: true,
    showSelection: true,
    onShuffle: handleShuffle,
  });

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, allStacks.length, selectedTag?.id]);

  // Mutations
  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      const response = await apiClient.put(`/api/v1/tags/${id}/rename`, { title });
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
      await Promise.all(ids.map((id) => apiClient.delete(`/api/v1/tags/${id}`)));
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
      const response = await apiClient.post('/api/v1/tags/merge', {
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

  const handleTagClick = (tag: TagItem) => {
    // Always show stacks when clicking a tag
    setSelectedTag(tag);
    try {
      const sp = new URLSearchParams(location.search);
      sp.set('tagId', String(tag.id));
      navigate({
        to: '/library/$datasetId/tags',
        params: { datasetId },
        search: () => Object.fromEntries(sp.entries()) as any,
      });
    } catch {}
  };

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
      const sp = new URLSearchParams(location.search);
      const idStr = sp.get('tagId');
      if (idStr && tagsData?.tags) {
        const id = Number(idStr);
        const found = (tagsData.tags || []).find((t) => t.id === id) || null;
        setSelectedTag(found);
      }
      if (!idStr) setSelectedTag(null);
    } catch {}
  }, [location.search, tagsData]);

  // Click handler with Cmd/Ctrl and Shift support
  const handleStackClick = useCallback(
    (stack: StackItem, event: React.MouseEvent) => {
      const idx = (allStacks || []).findIndex((s) => s?.id === stack.id);

      if (event.metaKey || event.ctrlKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        handleStackItemSelect(stack.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        if (!selectionMode) setSelectionMode(true);
        const last = lastClickedIndexRef.current ?? idx;
        if (last >= 0 && idx >= 0) {
          const [start, end] = last < idx ? [last, idx] : [idx, last];
          const next = new Set(selectedStackItems);
          for (let i = start; i <= end; i++) {
            const it = allStacks[i];
            if (it) next.add(it.id);
          }
          setSelectedStackItems(next);
        } else {
          handleStackItemSelect(stack.id);
        }
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      if (selectionMode) {
        event.preventDefault();
        handleStackItemSelect(stack.id);
        if (idx >= 0) lastClickedIndexRef.current = idx;
        return;
      }

      // Normal navigation: build ids from loaded stacks (right→left)
      const loadedIdsLtr = (allStacks || []).map((s) =>
        typeof s.id === 'string' ? Number.parseInt(s.id as string, 10) : (s.id as number)
      );
      const ids = loadedIdsLtr.slice().reverse();
      const clickedId =
        typeof stack.id === 'string'
          ? Number.parseInt(stack.id as string, 10)
          : (stack.id as number);
      const currentIndex = Math.max(
        0,
        ids.findIndex((id) => id === clickedId)
      );

      const mediaType = (stack as any).mediaType as string | undefined;
      const token = genListToken({
        datasetId,
        mediaType,
        filters: { tags: [String(selectedTag?.id)] } as any,
      });
      saveViewContext({
        token,
        datasetId,
        mediaType: mediaType as any,
        filters: { tags: [String(selectedTag?.id)] } as any,
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
      selectionMode,
      allStacks,
      datasetId,
      selectedTag,
      selectedStackItems,
      setSelectedStackItems,
      handleStackItemSelect,
      navigate,
      setSelectionMode,
    ]
  );

  const clearStackSelection = useCallback(() => {
    setSelectedStackItems(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    clearStackSelection();
    setIsEditPanelOpen(false);
  }, [clearStackSelection, setSelectionMode]);

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
  const refreshThumbnails = useCallback(
    async (stackIds: (string | number)[]) => {
      if (stackIds.length === 0) return;
      await apiClient.bulkRefreshThumbnails(stackIds);
      queryClient.invalidateQueries({ queryKey: ['tag-stacks', selectedTag?.id] });
    },
    [queryClient, selectedTag]
  );

  const handleRefreshThumbnails = useCallback(async () => {
    if (selectedStackItems.size === 0) return;

    const stackIds = Array.from(selectedStackItems);
    try {
      await refreshThumbnails(stackIds);
      exitSelectionMode();
    } catch (error) {
      console.error('Error refreshing thumbnails:', error);
    }
  }, [selectedStackItems, refreshThumbnails, exitSelectionMode]);

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

  const handleOptimizePreviews = useCallback(async () => {
    if (selectedStackItems.size === 0) return;

    const stackIds = Array.from(selectedStackItems).map((id) =>
      typeof id === 'string' ? Number.parseInt(id, 10) : id
    );

    try {
      for (const id of stackIds) {
        await apiClient.regenerateStackPreview({ stackId: id, datasetId, force: true });
      }

      exitSelectionMode();
      queryClient.invalidateQueries({ queryKey: ['tag-stacks', selectedTag?.id] });
    } catch (error) {
      console.error('Error optimizing video previews:', error);
      alert('Failed to optimize video previews. Please try again.');
    }
  }, [selectedStackItems, datasetId, exitSelectionMode, queryClient, selectedTag]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'r':
          e.preventDefault();
          if (!selectionMode) {
            setInfoSidebarOpen(false); // Close info sidebar when entering selection mode
            setSelectionMode(true);
          } else {
            exitSelectionMode(); // Use exitSelectionMode to properly clean up
          }
          break;
        case 'i':
          e.preventDefault();
          if (!infoSidebarOpen) {
            if (selectionMode) {
              exitSelectionMode(); // Exit selection mode properly when opening info sidebar
            }
          }
          setInfoSidebarOpen(!infoSidebarOpen);
          break;
        case 'e':
          e.preventDefault();
          if (selectionMode && selectedStackItems.size > 0) {
            toggleEditPanel();
          }
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
    selectionMode,
    infoSidebarOpen,
    setSelectionMode,
    setInfoSidebarOpen,
    exitSelectionMode,
    selectedStackItems.size,
    toggleEditPanel,
    isEditPanelOpen,
    closeEditPanel,
  ]);

  // This page uses its own layout
  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Tags List - Always visible */}
      <div className="w-80 flex-shrink-0">
        <div className="sticky top-14 h-[calc(100vh-56px)] border-r bg-white">
          <div className="overflow-y-auto h-full">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold mb-3">Tags</h2>

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
                    <SelectItem value="title-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="title-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="count-desc">Stack Count (High to Low)</SelectItem>
                    <SelectItem value="count-asc">Stack Count (Low to High)</SelectItem>
                  </SmallSelect>
                </div>

                {/* Action buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {selectedTags.size > 0
                        ? `${selectedTags.size} tags selected`
                        : 'Select tags to perform actions'}
                    </span>
                    {selectedTags.size > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => setSelectedTags(new Set())}
                      >
                        Clear
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
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleMerge}
                      disabled={selectedTags.size < 2}
                      className="h-7 px-2 text-xs flex-1"
                    >
                      <GitMerge className="h-3 w-3 mr-1" />
                      Merge
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
                  Error loading tags: {(tagsError as Error).message}
                </div>
              ) : tagsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading tags...</div>
              ) : filteredTags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'No tags found' : 'No tags yet'}
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
      </div>

      {/* Selected Tag Details */}
      {selectedTag ? (
        <div
          ref={scrollContainerRef}
          className={cn(
            'flex-1 bg-gray-50 transition-all duration-300 ease-in-out',
            !selectionMode && infoSidebarOpen ? 'mr-80' : 'mr-0'
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
                      const sp = new URLSearchParams(location.search);
                      sp.delete('tagId');
                      navigate({
                        to: '/library/$datasetId/tags',
                        params: { datasetId },
                        search: () => Object.fromEntries(sp.entries()) as any,
                      });
                    } catch {}
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground mt-1">
                {stacksData?.pages[0]?.total || 0} stacks
              </p>
            </div>

            {/* Stacks with this tag */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Stacks with this tag</h3>
              {allStacks.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  No stacks found with this tag
                </div>
              ) : (
                <>
                  <Suspense
                    fallback={
                      <div className="py-8 text-center text-muted-foreground">Loading…</div>
                    }
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 list-stable">
                      {allStacks.map((stack) => {
                        const thumb =
                          (stack as any).thumbnail ||
                          (stack as any).thumbnailUrl ||
                          '/no-image.png';
                        const likeCount = Number(
                          (stack as any).likeCount ?? (stack as any).liked ?? 0
                        );
                        const pageCount =
                          (stack as any).assetCount ||
                          (stack as any)._count?.assets ||
                          (stack as any).assetsCount ||
                          0;
                        const isFav =
                          (stack as any).favorited || (stack as any).isFavorite || false;
                        const {
                          onOpen,
                          onFindSimilar,
                          onAddToScratch,
                          onToggleFavorite,
                          onLike,
                          dragProps,
                          onInfo,
                        } = actions;
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
                      Scroll to load more...
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
            'flex-1 flex items-center justify-center bg-gray-50 transition-all duration-300 ease-in-out',
            !selectionMode && infoSidebarOpen ? 'mr-80' : 'mr-0',
            isEditPanelOpen && selectionMode ? 'mr-80' : ''
          )}
        >
          <div className="text-center">
            <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground">Select a tag to view details</p>
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
          actions={
            selectedStackItems.size > 0
              ? [
                  {
                    label: 'Bulk Edit',
                    value: 'bulk-edit',
                    onSelect: toggleEditPanel,
                    icon: <Pencil size={12} />,
                    group: 'primary',
                  },
                  {
                    label: 'Refresh Thumbnails',
                    value: 'refresh-thumbnails',
                    onSelect: handleRefreshThumbnails,
                    icon: <RefreshCw size={12} />,
                  },
                  {
                    label: 'Optimize Video',
                    value: 'optimize-video',
                    onSelect: handleOptimizePreviews,
                    icon: <Clapperboard size={12} />,
                  },
                  {
                    label: 'Delete Stacks',
                    value: 'delete-stacks',
                    onSelect: handleRemoveStacks,
                    icon: <Trash2 size={12} />,
                    confirmMessage: `選択した${selectedStackItems.size}件のスタックを削除します。元に戻せません。`,
                    destructive: true,
                  },
                ]
              : []
          }
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
            items={allStacks.filter((s) => selectedStackItems.has(s.id))}
          />,
          document.body
        )}

      {/* Portal for header actions */}
      {createPortal(
        <>
          {/* Selection mode button */}
          <HeaderIconButton
            onClick={() => {
              if (!selectionMode) {
                setInfoSidebarOpen(false); // Close info sidebar when entering selection mode
                setIsEditPanelOpen(false); // Close edit panel
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

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tag</DialogTitle>
            <DialogDescription>Enter a new name for the tag</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-title">New Title</Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter new title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={!newTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tags</DialogTitle>
            <DialogDescription>
              Select the tag to merge into. The selected tags will be deleted and their stacks will
              be reassigned.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="merge-target">Target Tag</Label>
              <Select
                value={mergeTargetId?.toString() || ''}
                onValueChange={(value) => setMergeTargetId(Number.parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target tag" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(selectedTags).map((id) => {
                    const tag = filteredTags.find((t) => t.id === id);
                    return tag ? (
                      <SelectItem key={id} value={id.toString()}>
                        {tag.title} ({tag.stackCount} stacks)
                      </SelectItem>
                    ) : null;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmMerge} disabled={!mergeTargetId}>
              Merge Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tags</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedTags.size} tag
              {selectedTags.size > 1 ? 's' : ''}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter panel to apply additional filters to selected tag's stacks */}
      <FilterPanel
        currentFilter={currentFilter as any}
        onFilterChange={(f) => setCurrentFilter({ ...f, datasetId })}
      />
    </div>
  );
}
