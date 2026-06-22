import { useParams } from '@tanstack/react-router';
import { Calendar, Monitor, Save, Search, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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

interface EditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Set<string | number>;
  onSave?: (updates: EditUpdates) => void;
  onApplyFilter?: (filter: { authors?: string[]; tags?: string[] }) => void;
  items?: Array<{ id: string | number; tags?: unknown; author?: unknown }>;
}

export interface EditUpdates {
  addTags?: string[];
  removeTags?: string[];
  setAuthor?: string;
  setMediaType?: 'image' | 'comic' | 'video';
}

const getStringField = (value: unknown, keys: string[]): string | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const field = record[key];
    if (typeof field === 'string' && field.trim().length > 0) {
      return field.trim();
    }
  }

  return undefined;
};

const normalizeTagName = (tag: unknown): string | undefined => {
  if (typeof tag === 'string') {
    const trimmed = tag.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return getStringField(tag, ['title', 'displayName', 'name', 'tag']);
};

const normalizeAuthorName = (author: unknown): string | undefined => {
  if (typeof author === 'string') {
    const trimmed = author.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return getStringField(author, ['name', 'displayName', 'title']);
};

const normalizeTagList = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];

  return tags.map((tag) => normalizeTagName(tag)).filter((tag): tag is string => tag !== undefined);
};

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
};

export default function BulkEditPanel({
  isOpen,
  onClose,
  selectedItems,
  onSave,
  onApplyFilter,
  items = [],
}: EditPanelProps) {
  const t = useT();
  const [tagInput, setTagInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'comic' | 'video' | ''>('');
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [authorSuggestions, setAuthorSuggestions] = useState<string[]>([]);
  const [tagLoading, setTagLoading] = useState(false);
  const [authorLoading, setAuthorLoading] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const params = useParams({ strict: false }) as { datasetId?: string };
  const datasetId = params.datasetId;

  // Extract unique tags and authors from selected items
  const selectedPanelItems = useMemo(
    () => items.filter((item) => selectedItems.has(item.id)),
    [items, selectedItems]
  );
  const existingTags = useMemo(
    () => uniqueStrings(selectedPanelItems.flatMap((item) => normalizeTagList(item.tags))),
    [selectedPanelItems]
  );
  const existingAuthors = useMemo(
    () =>
      uniqueStrings(
        selectedPanelItems
          .map((item) => normalizeAuthorName(item.author))
          .filter((author): author is string => author !== undefined)
      ),
    [selectedPanelItems]
  );

  // Filter application handlers
  const handleAuthorFilter = useCallback(
    (author: string) => {
      if (onApplyFilter) {
        onApplyFilter({ authors: [author] });
        onClose(); // Close edit panel after applying filter
      }
    },
    [onApplyFilter, onClose]
  );

  const handleTagFilter = useCallback(
    (tag: string) => {
      if (onApplyFilter) {
        onApplyFilter({ tags: [tag] });
        onClose(); // Close edit panel after applying filter
      }
    },
    [onApplyFilter, onClose]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Reset form when panel opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTagInput('');
      setAuthorInput('');
      setSelectedAuthor('');
      setSelectedMediaType('');
      setTagsToAdd([]);
    }
  }, [isOpen]);

  const handleAddTag = useCallback((tag: string) => {
    const normalized = tag.trim();
    if (!normalized) return;

    setTagsToAdd((current) => {
      if (current.includes(normalized)) return current;
      return [...current, normalized];
    });
    setTagInput('');
  }, []);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTagsToAdd((current) => current.filter((tag) => tag !== tagToRemove));
  }, []);

  const handleSelectAuthor = useCallback((author: string) => {
    setSelectedAuthor(author);
    setAuthorInput(author);
  }, []);

  const handleClearAuthor = useCallback(() => {
    setSelectedAuthor('');
    setAuthorInput('');
  }, []);

  const handleSearchTags = useCallback(
    async (query: string) => {
      setTagLoading(true);
      try {
        const results = await apiClient.searchTags(query, datasetId);
        const suggestions = results
          .map((tag) => normalizeTagName(tag))
          .filter((title): title is string => title !== undefined && title !== null);
        setTagSuggestions(suggestions);
      } catch (error) {
        console.error('Error searching tags:', error);
        setTagSuggestions([]);
      } finally {
        setTagLoading(false);
      }
    },
    [datasetId]
  );

  const handleSearchAuthors = useCallback(async (query: string) => {
    setAuthorLoading(true);
    try {
      const results = await apiClient.searchAuthors(query);
      const suggestions = results
        .map((author) => normalizeAuthorName(author))
        .filter((name): name is string => name !== undefined && name !== null);
      setAuthorSuggestions(suggestions);
    } catch (error) {
      console.error('Error searching authors:', error);
      setAuthorSuggestions([]);
    } finally {
      setAuthorLoading(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    const updates: EditUpdates = {};

    if (tagsToAdd.length > 0) {
      updates.addTags = tagsToAdd;
    }

    if (selectedAuthor) {
      updates.setAuthor = selectedAuthor;
    }

    if (selectedMediaType) {
      updates.setMediaType = selectedMediaType;
    }

    if (onSave) {
      onSave(updates);
    }

    onClose();
  }, [onSave, onClose, selectedAuthor, selectedMediaType, tagsToAdd]);

  const hasChanges = useMemo(
    () => tagsToAdd.length > 0 || Boolean(selectedAuthor) || Boolean(selectedMediaType),
    [selectedAuthor, selectedMediaType, tagsToAdd.length]
  );

  const swipeRef = useSwipeClose<HTMLDivElement>({
    direction: 'right',
    isActive: isOpen,
    onClose,
  });

  return (
    <div
      ref={swipeRef}
      className={cn(
        'fixed top-14 bottom-0 right-0 w-80 bg-white border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-40 shadow-xl',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}
      style={{ backgroundColor: '#ffffff', touchAction: 'pan-y' }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">{t.bulkEdit.title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={t.bulkEdit.exitSelection}
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>
          <span className="text-sm text-gray-600">
            {t.common.selectedCount(selectedItems.size)}
          </span>
        </div>

        {/* Edit Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6 bg-gray-50">
          {/* Add Tags */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Tag size={16} />
              {t.bulkEdit.addTags}
            </label>
            <div className="space-y-2">
              <SuggestInput
                value={tagInput}
                onChange={setTagInput}
                onSelect={handleAddTag}
                onSearch={handleSearchTags}
                placeholder={t.bulkEdit.typeTagEnter}
                suggestions={tagSuggestions}
                loading={tagLoading}
              />
              {tagsToAdd.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tagsToAdd.map((tag) => (
                    <div key={tag} className="flex items-center gap-1">
                      <Badge
                        variant="secondary"
                        className="cursor-pointer bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700 transition-colors text-base"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        #{tag}
                        <X size={12} className="ml-1" />
                      </Badge>
                      <button
                        type="button"
                        onClick={() => handleTagFilter(tag)}
                        className="p-1 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title={t.bulkEdit.applyTagFilter}
                      >
                        <Search size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">{t.bulkEdit.tagsWillBeAdded}</p>
            {/* Existing Tags from Selected Items */}
            {existingTags.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">{t.bulkEdit.tagsFromSelectedItems}</p>
                <div className="flex flex-wrap gap-1">
                  {existingTags.slice(0, 20).map((tag) => (
                    <div key={tag} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="px-2 py-1 text-base bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        #{tag}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTagFilter(tag)}
                        className="p-1 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title={t.bulkEdit.applyTagFilter}
                      >
                        <Search size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Set Author */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Calendar size={16} />
              {t.bulkEdit.setAuthor}
            </label>
            <div className="space-y-2">
              <SuggestInput
                value={authorInput}
                onChange={setAuthorInput}
                onSelect={handleSelectAuthor}
                onSearch={handleSearchAuthors}
                placeholder={t.bulkEdit.searchAuthor}
                suggestions={authorSuggestions}
                loading={authorLoading}
              />
              {selectedAuthor && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="cursor-pointer bg-primary/20 text-primary hover:bg-red-100 hover:text-red-700 transition-colors"
                    onClick={handleClearAuthor}
                  >
                    {selectedAuthor}
                    <X size={12} className="ml-1" />
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleAuthorFilter(selectedAuthor)}
                    className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title={t.bulkEdit.applyAuthorFilter}
                  >
                    <Search size={14} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">{t.bulkEdit.authorWillBeSet}</p>
            {/* Existing Authors from Selected Items */}
            {existingAuthors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">{t.bulkEdit.authorsFromSelectedItems}</p>
                <div className="flex flex-wrap gap-1">
                  {existingAuthors.slice(0, 10).map((author) => (
                    <div key={author} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectAuthor(author)}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        {author}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthorFilter(author)}
                        className="p-1 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title={t.bulkEdit.applyAuthorFilter}
                      >
                        <Search size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Change Media Type */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Monitor size={16} />
              {t.bulkEdit.changeMediaType}
            </label>
            <Select
              value={selectedMediaType}
              onValueChange={(value) => setSelectedMediaType(value as 'image' | 'comic' | 'video')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.bulkEdit.selectNewMediaType} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">{t.bulkEdit.image}</SelectItem>
                <SelectItem value="comic">{t.bulkEdit.comic}</SelectItem>
                <SelectItem value="video">{t.bulkEdit.video}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">{t.bulkEdit.mediaTypeWillChange}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white">
          {/* Save Changes */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {hasChanges ? (
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    {t.bulkEdit.changesReady}
                  </span>
                ) : (
                  <span>{t.bulkEdit.noChangesMade}</span>
                )}
              </div>
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
                >
                  <Save size={16} />
                  {t.bulkEdit.applyChanges}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
