import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SuggestInput } from '@/components/ui/suggest-input';
import { useIMEAwareKeyboard } from '@/hooks/useIMEAwareKeyboard';
import { apiClient } from '@/lib/api-client';

type NormalizedTag = {
  id: number;
  title: string;
};

const toNormalizedTags = (tags: unknown[]): NormalizedTag[] => {
  const normalized: NormalizedTag[] = [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      normalized.push({ id: -1, title: tag });
      continue;
    }

    if (typeof tag === 'object' && tag !== null) {
      const maybeTag = tag as { id?: unknown; title?: unknown };
      if (typeof maybeTag.id === 'number' && typeof maybeTag.title === 'string') {
        normalized.push({ id: maybeTag.id, title: maybeTag.title });
      }
    }
  }
  return normalized;
};

interface AutoTagMapping {
  id?: number;
  autoTagKey: string;
  tagId?: number;
  displayName: string;
  isActive: boolean;
  dataSetId: number;
  tag?: {
    id: number;
    title: string;
  };
}

interface AutoTagMappingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string;
  autoTagKey: string;
  existingMapping?: AutoTagMapping | null;
  onSuccess?: (mapping: AutoTagMapping) => void;
}

export default function AutoTagMappingModal({
  open,
  onOpenChange,
  datasetId,
  autoTagKey,
  existingMapping,
  onSuccess,
}: AutoTagMappingModalProps) {
  const queryClient = useQueryClient();
  const { createKeyDownHandler } = useIMEAwareKeyboard();
  const autoTagKeyInputId = useId();

  // Form state
  const [formData, setFormData] = useState({
    autoTagKey: '',
    tagId: '',
    displayName: '',
    isActive: true,
  });
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagSearchLoading, setTagSearchLoading] = useState(false);

  // Initialize form data when modal opens
  useEffect(() => {
    if (open) {
      if (existingMapping) {
        setFormData({
          autoTagKey: existingMapping.autoTagKey,
          tagId: existingMapping.tagId?.toString() || '',
          displayName: existingMapping.displayName,
          isActive: existingMapping.isActive,
        });
        setTagSearchQuery(existingMapping.tag?.title || existingMapping.displayName || '');
      } else {
        setFormData({
          autoTagKey,
          tagId: '',
          displayName: '',
          isActive: true,
        });
        setTagSearchQuery('');
      }
      // Clear any previous suggestions when opening
      setTagSuggestions([]);
    } else {
      // Clear suggestions when closing
      setTagSuggestions([]);
    }
  }, [open, autoTagKey, existingMapping]);

  // Fetch available tags for selection
  const { data: availableTags } = useQuery({
    queryKey: ['tags', datasetId],
    queryFn: async (): Promise<NormalizedTag[]> => {
      const tags = await apiClient.searchTags('', datasetId);
      return toNormalizedTags(tags as unknown[]);
    },
  });

  // Create or update mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // If no tagId but displayName is set, create a new tag first
      let finalTagId = data.tagId;

      if (!data.tagId && data.displayName && data.displayName !== data.autoTagKey) {
        // Create new tag
        try {
          const response = await apiClient.post('/api/v1/tags', {
            title: data.displayName,
            dataSetId: Number(datasetId),
          });
          finalTagId = response.data.id.toString();
        } catch (error) {
          console.error('Error creating tag:', error);
          throw new Error('Failed to create tag');
        }
      }

      const payload = {
        autoTagKey: data.autoTagKey,
        tagId: finalTagId ? Number.parseInt(finalTagId, 10) : undefined,
        displayName: data.displayName,
        isActive: data.isActive,
      };

      if (existingMapping?.id) {
        // For updates, don't send autoTagKey as it can't be changed
        const { autoTagKey: _autoTagKey, ...updatePayload } = payload;
        const response = await apiClient.put(
          `/api/v1/auto-tags/mappings/${datasetId}/${existingMapping.id}`,
          updatePayload
        );
        return response.data;
      }
      const response = await apiClient.post(`/api/v1/auto-tags/mappings/${datasetId}`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['autotag-mappings', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['stack'] });
      onSuccess?.(data);
      onOpenChange(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormData({
      autoTagKey: '',
      tagId: '',
      displayName: '',
      isActive: true,
    });
    setTagSearchQuery('');
    setTagSuggestions([]);
  };

  const handleSave = useCallback(() => {
    if (formData.autoTagKey && formData.displayName) {
      saveMappingMutation.mutate(formData);
    }
  }, [formData, saveMappingMutation]);

  const handleCancel = () => {
    onOpenChange(false);
    resetForm();
  };

  const escapeKey = 'Escape';

  // Keyboard handlers with IME support
  const handleKeyDown = createKeyDownHandler(() => handleSave(), {
    [escapeKey]: () => handleCancel(),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {existingMapping ? 'Edit AutoTag Mapping' : 'Create AutoTag Mapping'}
          </DialogTitle>
          <DialogDescription>
            Configure how this AutoTag prediction should be displayed and linked to existing tags.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor={autoTagKeyInputId}>AutoTag Key</Label>
            <Input
              id={autoTagKeyInputId}
              value={formData.autoTagKey}
              onChange={(e) => setFormData({ ...formData, autoTagKey: e.target.value })}
              placeholder="e.g., 1girl, blonde hair"
              disabled={!!existingMapping}
              className="font-mono text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tagId">Map to Tag</Label>
            <SuggestInput
              value={tagSearchQuery}
              onChange={(value) => {
                setTagSearchQuery(value);
                // Update displayName as user types
                if (value) {
                  const existingTag = availableTags?.find((t) => t.title === value);
                  if (existingTag) {
                    setFormData({
                      ...formData,
                      tagId: existingTag.id.toString(),
                      displayName: value,
                    });
                  } else {
                    setFormData({ ...formData, tagId: '', displayName: value });
                  }
                } else {
                  setFormData({ ...formData, tagId: '', displayName: '' });
                }
              }}
              onSelect={async (tagTitle) => {
                setTagSearchQuery(tagTitle);
                // Find existing tag or prepare to create new one
                const existingTag = availableTags?.find((t) => t.title === tagTitle);
                if (existingTag) {
                  setFormData({
                    ...formData,
                    tagId: existingTag.id.toString(),
                    displayName: tagTitle,
                  });
                } else {
                  // Will create new tag on save
                  setFormData({ ...formData, tagId: '', displayName: tagTitle });
                }
              }}
              onSearch={async (query) => {
                setTagSearchLoading(true);
                try {
                  // If query is empty, show popular tags
                  const searchQuery = query || '';
                  const tags = await apiClient.searchTags(searchQuery, datasetId);
                  const normalized = toNormalizedTags(tags as unknown[]);
                  const suggestions = normalized
                    .map((tag) => tag.title)
                    .filter((title): title is string => Boolean(title));
                  console.log('Tag suggestions received:', suggestions);
                  setTagSuggestions(suggestions);
                } catch (error) {
                  console.error('Error searching tags:', error);
                  setTagSuggestions([]);
                } finally {
                  setTagSearchLoading(false);
                }
              }}
              placeholder="Select existing tag or create new"
              suggestions={tagSuggestions}
              loading={tagSearchLoading}
              autoFocus={!existingMapping}
            />
            <p className="text-xs text-muted-foreground">
              Select an existing tag or type to create a new one
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !formData.autoTagKey || !formData.displayName || saveMappingMutation.isPending
            }
          >
            {saveMappingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existingMapping ? 'Update' : 'Create'} Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
