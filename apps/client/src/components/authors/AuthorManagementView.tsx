import { Check, GitMerge, Link as LinkIcon, Loader2, Save, Search, UserRound } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback } from 'react';
import { type AuthorLinkDraft, AuthorLinkEditor } from '@/components/authors/AuthorLinkEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthorLinkLabel, getAuthorLinkTone } from '@/lib/author-links';
import { cn } from '@/lib/utils';
import type { Author } from '@/types';

interface AuthorManagementCopy {
  title: string;
  searchPlaceholder: string;
  loading: string;
  noAuthors: string;
  noAuthorSelected: string;
  authorCount: (count: number) => string;
  stackCount: (count: number) => string;
  selectedForMerge: (count: number) => string;
  mergeCandidate: string;
  selectedMergeCandidate: string;
  name: string;
  links: string;
  linkUrl: string;
  linkUrlPlaceholder: string;
  addLink: string;
  removeLink: string;
  maxLinks: (count: number) => string;
  openLink: string;
  save: string;
  saving: string;
  mergeIntoSelected: string;
  merging: string;
}

interface AuthorManagementViewProps {
  authors: Author[];
  selectedAuthor: Author | null;
  selectedAuthorId: number | null;
  searchQuery: string;
  draftName: string;
  draftLinks: AuthorLinkDraft[];
  selectedMergeIds: ReadonlySet<number>;
  loading: boolean;
  saving: boolean;
  merging: boolean;
  copy: AuthorManagementCopy;
  onSearchChange: (value: string) => void;
  onSelectAuthor: (authorId: number) => void;
  onToggleMergeAuthor: (authorId: number) => void;
  onDraftNameChange: (value: string) => void;
  onDraftLinksChange: (links: AuthorLinkDraft[]) => void;
  onSave: () => void;
  onMerge: () => void;
}

const getAuthorId = (author: Author) => Number(author.id);
const getAuthorStackCount = (author: Author) => author.stackCount ?? author.count ?? 0;

export function AuthorManagementView({
  authors,
  selectedAuthor,
  selectedAuthorId,
  searchQuery,
  draftName,
  draftLinks,
  selectedMergeIds,
  loading,
  saving,
  merging,
  copy,
  onSearchChange,
  onSelectAuthor,
  onToggleMergeAuthor,
  onDraftNameChange,
  onDraftLinksChange,
  onSave,
  onMerge,
}: AuthorManagementViewProps) {
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.currentTarget.value);
    },
    [onSearchChange]
  );

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onDraftNameChange(event.currentTarget.value);
    },
    [onDraftNameChange]
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden bg-gray-50">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4 px-5 py-5">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-950">
              <UserRound size={24} />
              {copy.title}
            </h1>
          </div>
          <div className="text-sm text-gray-500">{copy.authorCount(authors.length)}</div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,360px)_minmax(0,1fr)] gap-4 max-lg:grid-cols-1">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white">
            <div className="shrink-0 border-b border-gray-100 p-3">
              <div className="relative">
                <Search
                  size={16}
                  className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-gray-400"
                />
                <Input
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder={copy.searchPlaceholder}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {copy.loading}
                </div>
              ) : authors.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500">
                  {copy.noAuthors}
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {authors.map((author) => {
                    const authorId = getAuthorId(author);
                    const isSelected = selectedAuthorId === authorId;
                    const selectedForMerge = selectedMergeIds.has(authorId);
                    return (
                      <li
                        key={authorId}
                        className={cn(
                          'flex items-stretch gap-2 px-3 py-2 transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-gray-50'
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => onSelectAuthor(authorId)}
                        >
                          <span className="block truncate text-sm font-medium text-gray-900">
                            {author.name}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            {copy.stackCount(getAuthorStackCount(author))}
                            {author.links?.length ? ` / ${author.links.length} ${copy.links}` : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'my-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-gray-500 transition-colors',
                            selectedForMerge
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-gray-200 bg-white hover:bg-gray-100',
                            isSelected && 'cursor-not-allowed opacity-40'
                          )}
                          disabled={isSelected}
                          onClick={() => onToggleMergeAuthor(authorId)}
                          title={
                            selectedForMerge ? copy.selectedMergeCandidate : copy.mergeCandidate
                          }
                        >
                          {selectedForMerge ? <Check size={15} /> : <GitMerge size={15} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto rounded-md border border-gray-200 bg-white">
            {selectedAuthor ? (
              <div className="space-y-6 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold text-gray-950">
                      {selectedAuthor.name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {copy.stackCount(getAuthorStackCount(selectedAuthor))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onMerge}
                      disabled={selectedMergeIds.size === 0 || merging || saving}
                    >
                      {merging ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <GitMerge size={15} />
                      )}
                      {selectedMergeIds.size > 0
                        ? copy.selectedForMerge(selectedMergeIds.size)
                        : copy.mergeIntoSelected}
                    </Button>
                    <Button
                      type="button"
                      onClick={onSave}
                      disabled={!draftName.trim() || saving || merging}
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {saving ? copy.saving : copy.save}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="author-management-name">{copy.name}</Label>
                      <Input
                        id="author-management-name"
                        value={draftName}
                        onChange={handleNameChange}
                        disabled={saving || merging}
                      />
                    </div>

                    {selectedAuthor.links && selectedAuthor.links.length > 0 ? (
                      <div className="space-y-2">
                        <Label>{copy.links}</Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedAuthor.links.map((link) => (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
                                getAuthorLinkTone(link.provider)
                              )}
                              title={copy.openLink}
                            >
                              <LinkIcon size={13} />
                              <span>{getAuthorLinkLabel(link)}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <AuthorLinkEditor
                    links={draftLinks}
                    onChange={onDraftLinksChange}
                    disabled={saving || merging}
                    copy={{
                      links: copy.links,
                      url: copy.linkUrl,
                      urlPlaceholder: copy.linkUrlPlaceholder,
                      addLink: copy.addLink,
                      removeLink: copy.removeLink,
                      maxLinks: copy.maxLinks,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center text-sm text-gray-500">
                {copy.noAuthorSelected}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
