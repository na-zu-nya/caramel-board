import { AutoTagDisplay } from '@/components/ui/autotag-display';
import { Badge } from '@/components/ui/badge';
import { ColorPalette } from '@/components/ui/color-ball';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SuggestInput } from '@/components/ui/suggest-input';
import { apiClient } from '@/lib/api-client';
import { cn, hexForCopy } from '@/lib/utils';
import {
  currentFilterAtom,
  customColorAtom,
  infoSidebarOpenAtom,
  selectedItemIdAtom,
} from '@/stores/ui';
import type { Author, DominantColor } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation } from '@tanstack/react-router';
import { useAtom, useSetAtom } from 'jotai';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  FolderOpen,
  Hash,
  Heart,
  Image,
  Loader2,
  NotebookText,
  Palette,
  Copy,
  RefreshCw,
  Star,
  Tag,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { GalleryVerticalEnd } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useScratch } from '@/hooks/useScratch';
import { addUploadNotificationAtom } from '@/stores/upload';
import { copyText } from '@/lib/clipboard';

interface InfoSidebarProps {
  hideThumbnails?: boolean;
}

export default function InfoSidebar({ hideThumbnails = true }: InfoSidebarProps) {
  const [isOpen, setIsOpen] = useAtom(infoSidebarOpenAtom);
  const [selectedItemId] = useAtom(selectedItemIdAtom);
  const [, setCustomColor] = useAtom(customColorAtom);
  const [currentFilter, setCurrentFilter] = useAtom(currentFilterAtom);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams({ strict: false });
  const datasetId = (params as { datasetId?: string }).datasetId || '1';
  const { ensureScratch } = useScratch(datasetId);
  const addNotification = useSetAtom(addUploadNotificationAtom);

  // Close Info panel on route changes, except when staying within StackViewer
  useEffect(() => {
    const path = location.pathname || '';
  const inStackViewer = /^\/library\/[^/]+\/stacks\/[^/]+(\/.*)?$/.test(path);
    if (!inStackViewer) {
      try {
        // Defer close to end of tick to avoid race with other updates
        setTimeout(() => setIsOpen(false), 0);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Fetch selected item data
  const { data: selectedItem, isLoading } = useQuery({
    queryKey: ['stack', datasetId, selectedItemId],
    queryFn: async () => {
      if (!selectedItemId) return null;
      return apiClient.getStack(String(selectedItemId), datasetId);
    },
    enabled: !!selectedItemId && isOpen,
  });

  const previewGenerated = Boolean(selectedItem?.assets?.some((asset) => asset.preview));
  const previewEligible = useMemo(() => {
    if (!selectedItem?.assets) return false;
    const previewable = new Set(['gif', 'mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);
    return selectedItem.assets.some((asset) => {
      const ext = asset.fileType?.toLowerCase();
      if (ext && previewable.has(ext)) return true;
      const src = asset.file || asset.url || '';
      const match = src.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/);
      if (!match) return false;
      return previewable.has(match[1]);
    });
  }, [selectedItem?.assets]);

  // State for editing
  const [tagInput, setTagInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [authorEditing, setAuthorEditing] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [authorSuggestions, setAuthorSuggestions] = useState<string[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [authorLoading, setAuthorLoading] = useState(false);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const [recentAuthors, setRecentAuthors] = useState<string[]>([]);

  // Color details state
  const [showColorDetails, setShowColorDetails] = useState(false);

  // Action buttons expanded state with sessionStorage
  const [actionsExpanded, setActionsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = sessionStorage.getItem('info-panel-actions-expanded');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Thumbnail expanded state with sessionStorage
  const [thumbnailExpanded, setThumbnailExpanded] = useState(() => {
    if (typeof window === 'undefined') return !hideThumbnails;
    try {
      const saved = sessionStorage.getItem('info-panel-thumbnail-expanded');
      return saved !== null ? JSON.parse(saved) : !hideThumbnails;
    } catch {
      return !hideThumbnails;
    }
  });

  // Save actions expanded state to sessionStorage
  const toggleActionsExpanded = () => {
    const newState = !actionsExpanded;
    setActionsExpanded(newState);
    try {
      sessionStorage.setItem('info-panel-actions-expanded', JSON.stringify(newState));
    } catch {
      // Ignore storage errors
    }
  };

  // Save thumbnail expanded state to sessionStorage
  const toggleThumbnailExpanded = () => {
    const newState = !thumbnailExpanded;
    setThumbnailExpanded(newState);
    try {
      sessionStorage.setItem('info-panel-thumbnail-expanded', JSON.stringify(newState));
    } catch {
      // Ignore storage errors
    }
  };

  // Update author input when item changes
  useEffect(() => {
    if (selectedItem?.author) {
      // Handle both string and object author
      const authorName =
        typeof selectedItem.author === 'string'
          ? selectedItem.author
          : (selectedItem.author as Author)?.name || '';
      setAuthorInput(authorName);
    } else {
      setAuthorInput('');
    }
  }, [selectedItem]);

  // Mutations for immediate updates
  const addTagMutation = useMutation({
    mutationFn: async ({ stackId, tag }: { stackId: number; tag: string }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      if (!response.ok) throw new Error('Failed to add tag');
      return response.json();
    },
    onSuccess: () => {
      // Stack detail + list caches
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'], refetchType: 'all' });
      // Side menu counts/lists
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      // Tag-specific list pages
      try { queryClient.invalidateQueries({ queryKey: ['tag-stacks'] }); } catch {}
      try { queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] }); } catch {}
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async ({ stackId, tag }: { stackId: number; tag: string }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove tag');
      return response.json();
    },
    onSuccess: () => {
      // Stack detail + list caches
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'], refetchType: 'all' });
      // Side menu counts/lists
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      // Tag-specific list pages
      try { queryClient.invalidateQueries({ queryKey: ['tag-stacks'] }); } catch {}
      try { queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] }); } catch {}
    },
  });

  const updateAuthorMutation = useMutation({
    mutationFn: async ({ stackId, author }: { stackId: number; author: string }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/author`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author }),
      });
      if (!response.ok) throw new Error('Failed to update author');
      return response.json();
    },
    onSuccess: () => {
      // Stack detail + list caches
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'], refetchType: 'all' });
      // Side menu authors list and counts
      queryClient.invalidateQueries({ queryKey: ['authors', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ stackId, favorited }: { stackId: number; favorited: boolean }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorited }),
      });
      if (!response.ok) throw new Error('Failed to toggle favorite');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const updateMediaTypeMutation = useMutation({
    mutationFn: async ({
      stackId,
      mediaType,
    }: { stackId: number; mediaType: 'image' | 'comic' | 'video' }) => {
      const response = await fetch(`/api/v1/stacks/bulk/media-type`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stackIds: [stackId], mediaType }),
      });
      if (!response.ok) throw new Error('Failed to update media type');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const handleAddTag = (tag: string) => {
    if (tag && selectedItem) {
      // Check if tag already exists (handle both string and object tags)
      const tagExists = selectedItem.tags?.some((existingTag) => {
        const tagName = typeof existingTag === 'string' ? existingTag : existingTag.name;
        return tagName === tag;
      });

      if (!tagExists) {
        addTagMutation.mutate({ stackId: Number(selectedItem.id), tag });
        setTagInput('');
        // Add to recent tags
        setRecentTags((prev) => [tag, ...prev.filter((t) => t !== tag)].slice(0, 10));
      }
    }
  };

  const handleCopyTag = async (tag: string) => {
    const ok = await copyText(tag);
    if (ok) {
      addNotification({ type: 'success', message: `Copied tag: ${tag}` });
    } else {
      addNotification({ type: 'error', message: 'Failed to copy (try HTTPS or use ⌘/Ctrl+C)' });
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (selectedItem) {
      removeTagMutation.mutate({ stackId: Number(selectedItem.id), tag });
    }
  };

  const handleAuthorChange = (author: string) => {
    if (selectedItem) {
      // Get current author name
      const currentAuthorName =
        typeof selectedItem.author === 'string'
          ? selectedItem.author
          : (selectedItem.author as Author)?.name || '';

      if (author !== currentAuthorName) {
        updateAuthorMutation.mutate({ stackId: Number(selectedItem.id), author });
        // Add to recent authors
        if (author) {
          setRecentAuthors((prev) => [author, ...prev.filter((a) => a !== author)].slice(0, 10));
        }
      }
    }
  };

  const handleToggleFavorite = () => {
    if (selectedItem) {
      const currentFavorited = selectedItem.favorited ?? false;
      toggleFavoriteMutation.mutate({
        stackId: Number(selectedItem.id),
        favorited: !currentFavorited,
      });
    }
  };

  const handleMediaTypeChange = (mediaType: 'image' | 'comic' | 'video') => {
    if (selectedItem && mediaType !== selectedItem.mediaType) {
      updateMediaTypeMutation.mutate({ stackId: Number(selectedItem.id), mediaType });
    }
  };

  const likeMutation = useMutation({
    mutationFn: async ({ stackId }: { stackId: number }) => {
      const response = await fetch(`/api/v1/stacks/${stackId}/like`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to like');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
      queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
    },
  });

  const handleLike = () => {
    if (selectedItem) {
      likeMutation.mutate({ stackId: Number(selectedItem.id) });
    }
  };

  const updateColorsMutation = useMutation({
    mutationFn: async ({ stackId }: { stackId: number }) => {
      const response = await apiClient.updateStackColors(stackId);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const handleUpdateColors = () => {
    if (selectedItem) {
      updateColorsMutation.mutate({ stackId: Number(selectedItem.id) });
    }
  };

  const updateAutoTagsMutation = useMutation({
    mutationFn: async ({ stackId }: { stackId: number }) => {
      const response = await apiClient.aggregateStackTags(stackId, { threshold: 0.4 });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  // Refresh (thumbnail + colors + auto-tags) in sequence (embeddings removed)
  const refreshAllMutation = useMutation({
    mutationFn: async ({ stackId }: { stackId: number }) => {
      // 1) Refresh thumbnail
      await apiClient.refreshThumbnail(stackId);
      // 2) Update colors
      await apiClient.updateStackColors(stackId);
      // 3) Aggregate AutoTags
      await apiClient.aggregateStackTags(stackId, { threshold: 0.4 });
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const regeneratePreviewMutation = useMutation({
    mutationFn: async ({ stackId, dataSetId }: { stackId: number; dataSetId: string }) => {
      return apiClient.regenerateStackPreview({ stackId, datasetId: dataSetId, force: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stack', datasetId, selectedItemId] });
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const handleUpdateAutoTags = () => {
    if (selectedItem) {
      updateAutoTagsMutation.mutate({ stackId: Number(selectedItem.id) });
    }
  };

  const handleColorClick = (color: DominantColor) => {
    // 色をクリックした時の動作：カスタムカラーに設定してフィルターを適用
    console.log('Color clicked:', color);

    // カスタムカラーを設定
    setCustomColor(color.hex);

    // カラーフィルターを適用
    setCurrentFilter({
      ...currentFilter,
      colorFilter: {
        ...currentFilter.colorFilter,
        customColor: color.hex,
        // 他の色選択をクリア
        hueCategories: undefined,
        similarityThreshold: currentFilter.colorFilter?.similarityThreshold || 85,
      },
    });

    // クリップボードにもコピー（非セキュア時はフォールバック）
    const copied = hexForCopy(color.hex);
    copyText(copied).then((ok) => {
      if (ok) {
        addNotification({ type: 'success', message: `Copied ${copied} to clipboard` });
      } else {
        addNotification({ type: 'error', message: 'Failed to copy to clipboard' });
      }
    });
  };

  return (
    <div
      className={cn(
        // Lower z-index so dialogs and modals appear above the sidebar
        'fixed top-14 bottom-0 right-0 w-80 bg-white/95 backdrop-blur-sm border-l border-gray-200 shadow-xl z-[40]',
        // Use broad transition-all for compatibility (some setups strip arbitrary variants)
        'transform-gpu will-change-[transform,opacity] transition-all duration-300 ease-in-out',
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
      )}
    >
      {!selectedItemId ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Image size={48} className="mx-auto mb-4 opacity-50" />
            <p>Select an item to view details</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : selectedItem ? (
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">
                  {selectedItem.name}
                </h2>
                <p className="text-sm text-gray-500">ID: {selectedItem.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    selectedItem.favorited ? 'text-yellow-500' : 'text-gray-400 hover:text-gray-600'
                  )}
                  disabled={toggleFavoriteMutation.isPending}
                >
                  <Star size={20} className={selectedItem.favorited ? 'fill-current' : ''} />
                </button>
                <button
                  type="button"
                  onClick={handleLike}
                  className="flex items-center gap-1 p-2 rounded-md transition-colors hover:bg-gray-100"
                  disabled={likeMutation.isPending}
                >
                  <Heart
                    size={20}
                    className={cn(
                      selectedItem.liked && selectedItem.liked > 0
                        ? 'text-like fill-current'
                        : 'text-gray-400'
                    )}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {selectedItem.liked || 0}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 space-y-6">
            {/* Thumbnail */}
            {(selectedItem.thumbnailUrl || selectedItem.thumbnail) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                  <div className="flex items-center gap-2">
                    <Image size={16} />
                    Thumbnail
                  </div>
                  <button
                    type="button"
                    onClick={toggleThumbnailExpanded}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {thumbnailExpanded ? 'Hide' : 'Show'}
                    {thumbnailExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    thumbnailExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  )}
                >
                  <div className="aspect-square w-full rounded-lg overflow-hidden bg-gray-100 mt-2">
                    <img
                      src={selectedItem.thumbnailUrl || selectedItem.thumbnail || ''}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Media Type */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Image size={16} />
                Media Type
              </div>
              <Select value={selectedItem.mediaType || ''} onValueChange={handleMediaTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select media type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="comic">Comic</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Author */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Calendar size={16} />
                Author
              </label>
              {!authorEditing ? (
                <button
                  type="button"
                  className="px-3 py-2 w-full text-left border border-transparent rounded-md hover:bg-gray-50"
                  onClick={() => {
                    const current =
                      (typeof selectedItem.author === 'string'
                        ? selectedItem.author
                        : (selectedItem.author as Author)?.name) || '';
                    setAuthorInput(current);
                    setAuthorEditing(true);
                  }}
                >
                  <span className="text-gray-900">
                    {(typeof selectedItem.author === 'string'
                      ? selectedItem.author
                      : (selectedItem.author as Author)?.name) || '—'}
                  </span>
                </button>
              ) : (
                <SuggestInput
                  value={authorInput}
                  onChange={setAuthorInput}
                  onSelect={handleAuthorChange}
                  onSearch={async (query) => {
                    setAuthorLoading(true);
                    try {
                      const results = await apiClient.searchAuthors(query, datasetId);
                      const suggestions = results
                        .map((author) => (typeof author === 'string' ? author : author.name))
                        .filter((name): name is string => name !== undefined && name !== null);
                      setAuthorSuggestions(suggestions);
                    } catch (error) {
                      console.error('Error searching authors:', error);
                      setAuthorSuggestions([]);
                    } finally {
                      setAuthorLoading(false);
                    }
                  }}
                  placeholder="Type author and Enter"
                  suggestions={authorSuggestions}
                  loading={authorLoading}
                  autoFocus
                />
              )}
              {/* Recent Authors */}
              {recentAuthors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">Recent authors:</p>
                  <div className="flex flex-wrap gap-1">
                    {recentAuthors.map((author) => (
                      <button
                        key={author}
                        type="button"
                        onClick={() => {
                          setAuthorInput(author);
                          handleAuthorChange(author);
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        {author}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Tag size={16} />
                Tags
              </label>
              <div className="space-y-2">
                <SuggestInput
                  value={tagInput}
                  onChange={setTagInput}
                  onSelect={handleAddTag}
                  onSearch={async (query) => {
                    setTagLoading(true);
                    try {
                      const results = await apiClient.searchTags(query, datasetId);
                      const suggestions = results
                        .map((tag) => (typeof tag === 'string' ? tag : tag.title))
                        .filter((title): title is string => title !== undefined && title !== null);
                      setTagSuggestions(suggestions);
                    } catch (error) {
                      console.error('Error searching tags:', error);
                      setTagSuggestions([]);
                    } finally {
                      setTagLoading(false);
                    }
                  }}
                  placeholder="Add tag"
                  suggestions={tagSuggestions}
                  loading={tagLoading}
                />
                {selectedItem.tags && selectedItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.tags.map((tag, index) => {
                      const tagName =
                        typeof tag === 'string' ? tag : tag.name || tag.displayName || String(tag);
                      return (
                        <Badge
                          key={typeof tag === 'string' ? tag : `tag-${index}`}
                          variant="default"
                          className="cursor-pointer hover:bg-primary/90 transition-colors flex items-center gap-1.5 pr-1 text-base"
                          onClick={() => {
                            // Apply tag filter
                            setCurrentFilter({
                              ...currentFilter,
                              tags: [tagName],
                            });
                          }}
                        >
                          <span>#{tagName}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(tagName);
                            }}
                            className="p-0.5 rounded hover:bg-white/20 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Recent Tags */}
              {recentTags.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">Recent tags:</p>
                  <div className="flex flex-wrap gap-1">
                    {recentTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AutoTags */}
            {selectedItem.autoTags && selectedItem.autoTags.length > 0 && (
              <AutoTagDisplay
                autoTags={selectedItem.autoTags}
                datasetId={datasetId}
                onAddTag={(tag) => {
                  // Check if tag already exists before adding
                  const tagExists = selectedItem.tags?.some((existingTag) => {
                    const tagName =
                      typeof existingTag === 'string' ? existingTag : existingTag.name;
                    return tagName === tag;
                  });

                  if (!tagExists) {
                    handleAddTag(tag);
                  }
                }}
                sessionStorageKey="info-panel-autotags-expanded"
              />
            )}

            {/* Dominant Colors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                <div className="flex items-center gap-2">
                  <Palette size={16} />
                  Dominant Colors
                </div>
                {selectedItem.dominantColors && selectedItem.dominantColors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowColorDetails(!showColorDetails)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Detail
                    {showColorDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <ColorPalette
                  colors={selectedItem.dominantColors || []}
                  size="lg"
                  onColorClick={handleColorClick}
                  className="justify-start"
                />
                <div
                  className={cn(
                    'overflow-hidden transition-all duration-300 ease-in-out',
                    showColorDetails ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  )}
                >
                  {selectedItem.dominantColors && selectedItem.dominantColors.length > 0 && (
                    <div className="space-y-3 text-xs text-gray-500 pt-2">
                      {selectedItem.dominantColors.map((color, index) => (
                        <div key={`${color.hex}-${index}`} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full border border-gray-300"
                                style={{ backgroundColor: color.hex }}
                              />
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-800"
                                onClick={async () => {
                                  const copied = hexForCopy(color.hex);
                                  const ok = await copyText(copied);
                                  if (ok) {
                                    addNotification({ type: 'success', message: `Copied ${copied} to clipboard` });
                                  } else {
                                    addNotification({ type: 'error', message: 'Failed to copy to clipboard' });
                                  }
                                }}
                                title="Copy hex"
                              >
                                <Copy size={12} />
                                <span>{color.hex}</span>
                              </button>
                            </span>
                            <span className="font-medium">
                              {Math.round(color.percentage * 100)}%
                            </span>
                          </div>
                          {color.lightness !== undefined && color.saturation !== undefined && (
                            <div className="pl-5 space-y-2">
                              <Progress
                                value={color.lightness}
                                max={100}
                                label="Brightness"
                                size="sm"
                                color="primary"
                                className="text-gray-400"
                              />
                              <Progress
                                value={color.saturation}
                                max={100}
                                label="Saturation"
                                size="sm"
                                color="gray"
                                className="text-gray-400"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Hash size={16} />
                Stats
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Assets</span>
                  <span className="font-medium">{selectedItem.assetCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Likes</span>
                  <span className="font-medium">{selectedItem.liked || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Optimized</span>
                  <span className="font-medium">
                    {previewGenerated ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span className="font-medium">
                    {new Date(selectedItem.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gray-200">
            {/* Header with toggle button */}
            <div className="p-4 pb-2">
              <div className="w-full flex items-center justify-between text-sm font-medium text-gray-700">
                <span>Actions</span>
              </div>
            </div>

            {/* Expandable buttons */}
            <div>
              <div className="px-4 pb-4 space-y-2">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  onClick={async () => {
                    if (!selectedItem) return;
                    const id = typeof selectedItem.id === 'string' ? parseInt(selectedItem.id, 10) : Number(selectedItem.id);
                    await navigate({
                      to: '/library/$datasetId/stacks/$stackId/similar',
                      params: { datasetId, stackId: String(id) },
                    });
                  }}
                  disabled={!selectedItem}
                >
                  <GalleryVerticalEnd size={16} />
                  Find similar
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  onClick={async () => {
                    if (!selectedItem) return;
                    try {
                      const sc = await ensureScratch();
                      await apiClient.addStackToCollection(sc.id, Number(selectedItem.id));
                      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
                      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
                    } catch (e) {
                      console.error('Failed to add to Scratch', e);
                    }
                  }}
                  disabled={!selectedItem}
                >
                  <NotebookText size={16} />
                  Add to Scratch
                </button>
                {previewEligible && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() =>
                      selectedItem &&
                      regeneratePreviewMutation.mutate({
                        stackId: Number(selectedItem.id),
                        dataSetId: datasetId,
                      })
                    }
                    disabled={!selectedItem || regeneratePreviewMutation.isPending}
                  >
                    {regeneratePreviewMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Clapperboard size={16} />
                    )}
                    Optimize Video
                  </button>
                )}
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  onClick={() => selectedItem && refreshAllMutation.mutate({ stackId: Number(selectedItem.id) })}
                  disabled={!selectedItem || refreshAllMutation.isPending}
                >
                  {refreshAllMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  Refresh
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                  onClick={async () => {
                    if (selectedItem) {
                      const confirmed = window.confirm(
                        `Are you sure you want to remove the stack "${selectedItem.name}"? This action cannot be undone.`
                      );
                      if (confirmed) {
                        try {
                          await apiClient.removeStack(Number(selectedItem.id));
                          // Close sidebar and refresh list
                          queryClient.invalidateQueries({ queryKey: ['stacks'] });
                          console.log('✅ Stack removed successfully');
                          
                          // Navigate back to the list page
                          const currentPath = window.location.pathname;
                          
                          // Check if we're in the stack viewer page
                          if (currentPath.includes('/stacks/')) {
                            // Extract mediaType from current path or use default
                            const mediaTypeMatch = currentPath.match(/media-type\/(\w+)/);
                            const mediaType = selectedItem.mediaType || mediaTypeMatch?.[1] || 'image';
                            
                            // Navigate to the appropriate media type page
                            navigate({
                              to: '/library/$datasetId/media-type/$mediaType',
                              params: { datasetId, mediaType }
                            });
                          }
                        } catch (error) {
                          console.error('❌ Failed to remove stack:', error);
                          alert('Failed to remove stack. Please try again.');
                        }
                      }
                    }
                  }}
                  disabled={!selectedItem}
                >
                  <Trash2 size={16} />
                  Remove Stack
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
