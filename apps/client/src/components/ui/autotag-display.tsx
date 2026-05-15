import { Check, ChevronDown, ChevronUp, Copy, Wand2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import AutoTagMappingModal from '@/components/modals/AutoTagMappingModal';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AutoTag } from '@/types';

const AUTOTAG_DISPLAY_MODE_KEY = 'autotag-display-mode';

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

interface AutoTagDisplayProps {
  autoTags: AutoTag[];
  datasetId: string;
  onAddTag?: (tag: string) => void;
  onMappingSuccess?: (mapping: { displayName?: string }) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  sessionStorageKey?: string;
  className?: string;
  badgeClassName?: string;
  showIcon?: boolean;
  title?: string;
}

export function AutoTagDisplay({
  autoTags,
  datasetId,
  onAddTag,
  onMappingSuccess,
  expanded: controlledExpanded,
  onExpandedChange,
  sessionStorageKey,
  className,
  badgeClassName = 'text-xs cursor-pointer hover:bg-purple-100 hover:text-purple-700 transition-colors',
  showIcon = true,
  title = 'AutoTags',
}: AutoTagDisplayProps) {
  // AutoTag mapping modal state
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedAutoTagKey, setSelectedAutoTagKey] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Display mode: 'assigned' (default) or 'original'
  const [displayMode, setDisplayMode] = useState<'assigned' | 'original'>(() => {
    if (typeof window === 'undefined') return 'assigned';
    try {
      const saved = localStorage.getItem(AUTOTAG_DISPLAY_MODE_KEY);
      return saved === 'original' ? 'original' : 'assigned';
    } catch {
      return 'assigned';
    }
  });

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => {
      const next = prev === 'assigned' ? 'original' : 'assigned';
      try {
        localStorage.setItem(AUTOTAG_DISPLAY_MODE_KEY, next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const handleCopyTags = useCallback(() => {
    const originalNames = autoTags.map((tag) => {
      const isString = typeof tag === 'string';
      return isString ? tag : tag.autoTagKey;
    });
    const text = originalNames.join(', ');
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {
            fallbackCopy(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        );
      } else {
        fallbackCopy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      fallbackCopy(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [autoTags]);

  // Handle expanded state - can be controlled or uncontrolled
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(() => {
    if (controlledExpanded !== undefined) return controlledExpanded;
    if (typeof window === 'undefined' || !sessionStorageKey) return false;
    try {
      const saved = sessionStorage.getItem(sessionStorageKey);
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const expanded = controlledExpanded !== undefined ? controlledExpanded : uncontrolledExpanded;

  const toggleExpanded = () => {
    const newState = !expanded;

    if (controlledExpanded === undefined) {
      setUncontrolledExpanded(newState);
      if (sessionStorageKey) {
        try {
          sessionStorage.setItem(sessionStorageKey, JSON.stringify(newState));
        } catch {
          // Ignore storage errors
        }
      }
    }

    onExpandedChange?.(newState);
  };

  const handleBadgeClick = (tag: AutoTag) => {
    const isString = typeof tag === 'string';
    const autoTagKey = isString ? tag : tag.autoTagKey;
    const tagToAdd = isString ? tag : tag.mappedTag?.title || tag.autoTagKey;
    const isMapped = !isString && tag.mappedTag;

    if (isMapped && onAddTag && tagToAdd) {
      // If mapped and onAddTag is provided, add the tag
      onAddTag(tagToAdd);
    } else {
      // If not mapped, open mapping modal
      setSelectedAutoTagKey(autoTagKey);
      setMappingModalOpen(true);
    }
  };

  const handleMappingSuccess = (mapping: { displayName?: string }) => {
    // Call the provided callback
    onMappingSuccess?.(mapping);

    // If onAddTag is provided and mapping has displayName, add the tag
    if (onAddTag && mapping.displayName) {
      onAddTag(mapping.displayName);
    }
  };

  if (!autoTags || autoTags.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm font-medium text-gray-700">
        <div className="flex items-center gap-2">
          {showIcon && <Wand2 size={16} />}
          {title}
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? 'Hide' : 'Show'}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="flex flex-wrap gap-1.5 pt-2">
          {autoTags.map((tag) => {
            const isString = typeof tag === 'string';
            const autoTagKey = isString ? tag : tag.autoTagKey;
            const assignedName = isString ? tag : tag.mappedTag?.title || tag.displayName;
            const isMapped = !isString && tag.mappedTag;
            const shownName = displayMode === 'original' ? autoTagKey : assignedName;

            return (
              <Badge
                key={`autotag-${autoTagKey}`}
                variant="secondary"
                className={badgeClassName}
                onClick={() => handleBadgeClick(tag)}
                title={
                  isMapped && onAddTag
                    ? `Click to add "${assignedName}" to tags (AutoTag: ${autoTagKey})`
                    : `Click to assign a tag to "${autoTagKey}"`
                }
              >
                {shownName}
              </Badge>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-3 pt-1.5">
          <button
            type="button"
            onClick={handleCopyTags}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy Tags'}
          </button>
          <button
            type="button"
            onClick={toggleDisplayMode}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {displayMode === 'assigned' ? 'Show Original' : 'Show Assigned'}
          </button>
        </div>
      </div>

      {/* AutoTag Mapping Modal */}
      <AutoTagMappingModal
        open={mappingModalOpen}
        onOpenChange={setMappingModalOpen}
        datasetId={datasetId}
        autoTagKey={selectedAutoTagKey}
        onSuccess={handleMappingSuccess}
      />
    </div>
  );
}
