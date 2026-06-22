import { Check, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAuthorLinkPreview } from '@/lib/author-links';
import { cn } from '@/lib/utils';

interface AuthorLinkQuickAddProps {
  open: boolean;
  addLabel: string;
  urlLabel: string;
  urlPlaceholder: string;
  submitLabel: string;
  submitting: boolean;
  disabled?: boolean;
  initialUrl?: string;
  showPrefix?: boolean;
  showTriggerLabel?: boolean;
  triggerIcon?: ReactNode;
  triggerTitle?: string;
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
  initialUrl = '',
  showPrefix = true,
  showTriggerLabel = true,
  triggerIcon,
  triggerTitle,
  triggerClassName,
  onOpenChange,
  onSubmit,
}: AuthorLinkQuickAddProps) {
  const [url, setUrl] = useState(initialUrl);
  const preview = useMemo(() => getAuthorLinkPreview(url), [url]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setUrl(initialUrl);
      } else {
        setUrl('');
      }
      onOpenChange(nextOpen);
    },
    [initialUrl, onOpenChange]
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-auto min-h-6 min-w-0 justify-start gap-1.5 rounded-[3px] px-1.5 py-0 text-[11px] leading-4 text-slate-500 hover:bg-slate-100 hover:text-slate-600',
            triggerClassName
          )}
          disabled={disabled || submitting}
          title={triggerTitle}
          aria-label={triggerTitle ?? addLabel}
        >
          {triggerIcon}
          {showPrefix && <span aria-hidden="true">+</span>}
          {showTriggerLabel && <span className="truncate">{addLabel}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-60 p-2">
        <div className="space-y-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder={urlPlaceholder}
            aria-label={urlLabel}
            disabled={submitting}
            className="h-8 px-2 py-1 text-xs"
            autoFocus
          />
          <div className="flex min-h-7 items-center justify-between gap-2">
            {preview ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="rounded-[3px] bg-slate-100 px-1.5 text-[11px] leading-4 text-slate-600">
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
              className="ml-auto h-7 shrink-0 px-2 text-xs"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
