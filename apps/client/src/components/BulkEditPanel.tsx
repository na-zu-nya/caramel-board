import {Badge} from '@/components/ui/badge';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from '@/components/ui/select';
import {SuggestInput} from '@/components/ui/suggest-input';
import {useSwipeClose} from '@/hooks/features/useSwipeClose';
import {apiClient} from '@/lib/api-client';
import {cn} from '@/lib/utils';
import {useParams} from '@tanstack/react-router';
import {Calendar, Monitor, Save, Search, Tag, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';

interface EditPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: Set<string | number>;
  onSave?: (updates: EditUpdates) => void;
  onApplyFilter?: (filter: { authors?: string[]; tags?: string[] }) => void;
  items?: Array<{ id: string | number; tags?: string[]; author?: string }>;
}

export interface EditUpdates {
  addTags?: string[];
  removeTags?: string[];
  setAuthor?: string;
  setMediaType?: 'image' | 'comic' | 'video';
}

export default function BulkEditPanel({
  isOpen,
  onClose,
  selectedItems,
  onSave,
  onApplyFilter,
  items = [],
}: EditPanelProps) {
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
  // @ts-ignore
  const params = useParams({ strict: false });
  const datasetId = (params as { datasetId?: string }).datasetId;

  // Extract unique tags and authors from selected items
  const existingTags = [...new Set(items.flatMap((item) => item.tags || []))];
  const existingAuthors = [
    ...new Set(items.map((item) => item.author).filter(Boolean)),
  ] as string[];

  // Filter application handlers
  const handleAuthorFilter = (author: string) => {
    if (onApplyFilter) {
      onApplyFilter({ authors: [author] });
      onClose(); // Close edit panel after applying filter
    }
  };

  const handleTagFilter = (tag: string) => {
    if (onApplyFilter) {
      onApplyFilter({ tags: [tag] });
      onClose(); // Close edit panel after applying filter
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

  const handleAddTag = (tag: string) => {
    if (tag && !tagsToAdd.includes(tag)) {
      setTagsToAdd([...tagsToAdd, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsToAdd(tagsToAdd.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = () => {
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
  };

  const hasChanges = tagsToAdd.length > 0 || selectedAuthor || selectedMediaType;

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
            <h2 className="text-lg font-semibold text-gray-900">Bulk Edit</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Exit selection mode"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>
          <span className="text-sm text-gray-600">
            {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
          </span>
        </div>

        {/* Edit Content */}
        <div className="flex-1 overflow-auto p-4 space-y-6 bg-gray-50">
          {/* Add Tags */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Tag size={16} />
              Add Tags
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
                placeholder="Type tag and press Enter"
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
                        title="Apply tag filter"
                      >
                        <Search size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">These tags will be added to all selected items</p>
            {/* Existing Tags from Selected Items */}
            {existingTags.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Tags from selected items:</p>
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
                        title="Apply tag filter"
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
              Set Author
            </label>
            <div className="space-y-2">
              <SuggestInput
                value={authorInput}
                onChange={setAuthorInput}
                onSelect={(author) => {
                  setSelectedAuthor(author);
                  setAuthorInput(author);
                }}
                onSearch={async (query) => {
                  setAuthorLoading(true);
                  try {
                    const results = await apiClient.searchAuthors(query);
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
                placeholder="Search and select author"
                suggestions={authorSuggestions}
                loading={authorLoading}
              />
              {selectedAuthor && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="cursor-pointer bg-primary/20 text-primary hover:bg-red-100 hover:text-red-700 transition-colors"
                    onClick={() => {
                      setSelectedAuthor('');
                      setAuthorInput('');
                    }}
                  >
                    {selectedAuthor}
                    <X size={12} className="ml-1" />
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleAuthorFilter(selectedAuthor)}
                    className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Apply author filter"
                  >
                    <Search size={14} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">This author will be set for all selected items</p>
            {/* Existing Authors from Selected Items */}
            {existingAuthors.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Authors from selected items:</p>
                <div className="flex flex-wrap gap-1">
                  {existingAuthors.slice(0, 10).map((author) => (
                    <div key={author} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAuthor(author);
                          setAuthorInput(author);
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      >
                        {author}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthorFilter(author)}
                        className="p-1 text-gray-500 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Apply author filter"
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
              Change Media Type
            </label>
            <Select
              value={selectedMediaType}
              onValueChange={(value) => setSelectedMediaType(value as 'image' | 'comic' | 'video')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select new media type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="comic">Comic</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              All selected items will be changed to this media type
            </p>
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
                    Changes ready to apply
                  </span>
                ) : (
                  <span>No changes made</span>
                )}
              </div>
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
                >
                  <Save size={16} />
                  Apply Changes
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
