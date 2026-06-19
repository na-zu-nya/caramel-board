import { ExternalLink, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthorLinkPreview, getAuthorLinkTone, MAX_AUTHOR_LINKS } from '@/lib/author-links';
import { cn } from '@/lib/utils';

export interface AuthorLinkDraft {
  id?: number;
  url: string;
}

interface AuthorLinkEditorCopy {
  links: string;
  url: string;
  urlPlaceholder: string;
  addLink: string;
  removeLink: string;
  maxLinks: (count: number) => string;
}

interface AuthorLinkEditorProps {
  links: AuthorLinkDraft[];
  copy: AuthorLinkEditorCopy;
  disabled?: boolean;
  onChange: (links: AuthorLinkDraft[]) => void;
}

export function AuthorLinkEditor({
  links,
  copy,
  disabled = false,
  onChange,
}: AuthorLinkEditorProps) {
  const handleAdd = useCallback(() => {
    if (links.length >= MAX_AUTHOR_LINKS) return;
    onChange([...links, { url: '' }]);
  }, [links, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(links.filter((_, currentIndex) => currentIndex !== index));
    },
    [links, onChange]
  );

  const handleLinkChange = useCallback(
    (index: number, patch: Partial<AuthorLinkDraft>) => {
      onChange(
        links.map((link, currentIndex) =>
          currentIndex === index
            ? {
                ...link,
                ...patch,
              }
            : link
        )
      );
    },
    [links, onChange]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{copy.links}</Label>
        <span className="text-xs text-gray-500">{copy.maxLinks(MAX_AUTHOR_LINKS)}</span>
      </div>

      <div className="space-y-3">
        {links.map((link, index) => {
          const preview = getAuthorLinkPreview(link.url);
          return (
            <div
              key={link.id ?? `new-${index}`}
              className="grid gap-2 rounded-md border border-gray-200 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical size={15} className="text-gray-300" />
                <span className="text-xs font-medium text-gray-500">{index + 1}</span>
                {preview ? (
                  <span
                    className={cn(
                      'inline-flex min-w-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
                      getAuthorLinkTone(preview.provider)
                    )}
                  >
                    {preview.label}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink size={13} />
                      {copy.url}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    onClick={() => handleRemove(index)}
                    disabled={disabled}
                    title={copy.removeLink}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`author-link-url-${index}`} className="text-xs">
                  {copy.url}
                </Label>
                <Input
                  id={`author-link-url-${index}`}
                  value={link.url}
                  onChange={(event) => handleLinkChange(index, { url: event.currentTarget.value })}
                  placeholder={copy.urlPlaceholder}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={disabled || links.length >= MAX_AUTHOR_LINKS}
      >
        <Plus size={15} />
        {copy.addLink}
      </Button>
    </div>
  );
}
