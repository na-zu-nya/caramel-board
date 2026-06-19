import { Check, Link as LinkIcon, Loader2, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAuthorLinkPreview, getAuthorLinkTone } from '@/lib/author-links';
import { cn } from '@/lib/utils';

interface AuthorLinkQuickAddProps {
  open: boolean;
  addLabel: string;
  urlLabel: string;
  urlPlaceholder: string;
  submitLabel: string;
  submitting: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { url: string }) => void;
}

export function AuthorLinkQuickAdd({
  open,
  addLabel,
  urlLabel,
  urlPlaceholder,
  submitLabel,
  submitting,
  disabled = false,
  triggerClassName,
  onOpenChange,
  onSubmit,
}: AuthorLinkQuickAddProps) {
  const [url, setUrl] = useState('');
  const preview = useMemo(() => getAuthorLinkPreview(url), [url]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setUrl('');
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleSubmit = useCallback(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onSubmit({ url: trimmedUrl });
    setUrl('');
    onOpenChange(false);
  }, [onOpenChange, onSubmit, url]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-7 items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-50',
            triggerClassName
          )}
          disabled={disabled || submitting}
        >
          <Plus size={12} />
          {addLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-72 p-3">
        <div className="space-y-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder={urlPlaceholder}
            aria-label={urlLabel}
            disabled={submitting}
            autoFocus
          />
          <div className="flex min-h-8 items-center justify-between gap-2">
            {preview ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                    getAuthorLinkTone(preview.provider)
                  )}
                >
                  <LinkIcon size={12} />
                  {preview.label}
                </span>
                <span className="truncate text-xs text-gray-500">{preview.externalLabel}</span>
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !url.trim()}
              className="ml-auto h-8 shrink-0 px-2"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
