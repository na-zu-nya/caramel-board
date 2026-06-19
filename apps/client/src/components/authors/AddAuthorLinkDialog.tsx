import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { getAuthorLinkPreview, getAuthorLinkTone } from '@/lib/author-links';
import { cn } from '@/lib/utils';

interface AddAuthorLinkDialogProps {
  open: boolean;
  authorName: string;
  title: string;
  description: string;
  urlLabel: string;
  urlPlaceholder: string;
  cancelLabel: string;
  submitLabel: string;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { url: string }) => void;
}

export function AddAuthorLinkDialog({
  open,
  authorName,
  title,
  description,
  urlLabel,
  urlPlaceholder,
  cancelLabel,
  submitLabel,
  submitting,
  onOpenChange,
  onSubmit,
}: AddAuthorLinkDialogProps) {
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
  }, [onSubmit, url]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon size={18} />
            {title}
          </DialogTitle>
          <DialogDescription>{description.replace('{author}', authorName)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="author-link-url">{urlLabel}</Label>
            <Input
              id="author-link-url"
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              placeholder={urlPlaceholder}
              disabled={submitting}
            />
          </div>
          {preview ? (
            <div className="flex min-w-0 items-center gap-2">
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
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !url.trim()}>
            <ExternalLink size={15} />
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
