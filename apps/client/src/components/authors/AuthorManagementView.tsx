import {
  Check,
  GitMerge,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { ChangeEvent, ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { AuthorLinkQuickAdd } from '@/components/authors/AuthorLinkQuickAdd';
import { authorLinkStyles } from '@/components/authors/authorLinkStyles';
import { StackTileGrid } from '@/components/StackTileGrid';
import { Button } from '@/components/ui/button';
import { SmallSearchField } from '@/components/ui/Controls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthorLinkLabel, MAX_AUTHOR_LINKS } from '@/lib/author-links';
import { cn } from '@/lib/utils';
import type { Author, AuthorLink, MediaGridItem } from '@/types';

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
  updateLink: string;
  editLink: string;
  assignedStacks: string;
  noAssignedStacks: string;
  loadMore: string;
  save: string;
  saving: string;
  mergeIntoSelected: string;
  merging: string;
}

interface AuthorManagementViewProps {
  authors?: Author[] | null;
  selectedAuthor: Author | null;
  selectedAuthorId: number | null;
  datasetId?: string | number;
  searchQuery: string;
  draftName: string;
  authorStacks?: MediaGridItem[] | null;
  authorStacksTotal?: number;
  selectedMergeIds?: ReadonlySet<number> | null;
  stackSelectionMode?: boolean;
  selectedStackIds?: ReadonlySet<string | number>;
  selectedStackActionCount?: number;
  loading: boolean;
  authorStacksLoading: boolean;
  authorStacksLoadingMore: boolean;
  authorStacksHasMore: boolean;
  saving: boolean;
  merging: boolean;
  linkSubmitting: boolean;
  copy: AuthorManagementCopy;
  onSearchChange: (value: string) => void;
  onSelectAuthor: (authorId: number) => void;
  onToggleMergeAuthor: (authorId: number) => void;
  onDraftNameChange: (value: string) => void;
  onAddAuthorLink: (input: { url: string }) => void;
  onUpdateAuthorLink: (linkId: AuthorLink['id'], input: { url: string }) => void;
  onRemoveAuthorLink: (linkId: AuthorLink['id']) => void;
  onLoadMoreAuthorStacks: () => void;
  onEnterStackSelectionMode?: (stackId: string | number) => void;
  onToggleStackSelection?: (stackId: string | number) => void;
  onSelectStackRange?: (stackIds: Array<string | number>) => void;
  onBulkEditSelectedStacks?: () => void;
  onDownloadSelectedStacks?: () => void;
  onRemoveSelectedStacks?: () => void;
  getStackLinkElement?: (stack: MediaGridItem) => ReactElement;
  onOpenStack?: (stack: MediaGridItem) => void | Promise<void>;
  onDownloadStack?: (stack: MediaGridItem) => void;
  onSave: () => void;
  onMerge: () => void;
}

const getAuthorId = (author: Author) => Number(author.id);
const getAuthorStackCount = (author: Author) => author.stackCount ?? author.count ?? 0;
const EMPTY_AUTHORS: Author[] = [];
const EMPTY_SELECTED_MERGE_IDS = new Set<number>();
const EMPTY_AUTHOR_LINKS: NonNullable<Author['links']> = [];
const EMPTY_AUTHOR_STACKS: MediaGridItem[] = [];
const NEW_LINK_EDITOR_ID = 'new';

export function AuthorManagementView({
  authors,
  selectedAuthor,
  selectedAuthorId,
  datasetId,
  searchQuery,
  draftName,
  authorStacks,
  authorStacksTotal,
  selectedMergeIds,
  stackSelectionMode = false,
  selectedStackIds,
  selectedStackActionCount = 0,
  loading,
  authorStacksLoading,
  authorStacksLoadingMore,
  authorStacksHasMore,
  saving,
  merging,
  linkSubmitting,
  copy,
  onSearchChange,
  onSelectAuthor,
  onToggleMergeAuthor,
  onDraftNameChange,
  onAddAuthorLink,
  onUpdateAuthorLink,
  onRemoveAuthorLink,
  onLoadMoreAuthorStacks,
  onEnterStackSelectionMode,
  onToggleStackSelection,
  onSelectStackRange,
  onBulkEditSelectedStacks,
  onDownloadSelectedStacks,
  onRemoveSelectedStacks,
  getStackLinkElement,
  onOpenStack,
  onDownloadStack,
  onSave,
  onMerge,
}: AuthorManagementViewProps) {
  const safeAuthors = Array.isArray(authors) ? authors : EMPTY_AUTHORS;
  const safeSelectedMergeIds = selectedMergeIds ?? EMPTY_SELECTED_MERGE_IDS;
  const safeAuthorStacks = Array.isArray(authorStacks) ? authorStacks : EMPTY_AUTHOR_STACKS;
  const selectedAuthorLinks = Array.isArray(selectedAuthor?.links)
    ? selectedAuthor.links
    : EMPTY_AUTHOR_LINKS;
  const [openLinkEditorId, setOpenLinkEditorId] = useState<
    AuthorLink['id'] | typeof NEW_LINK_EDITOR_ID | null
  >(null);
  const canAddLink = selectedAuthorLinks.length < MAX_AUTHOR_LINKS;
  const selectedAuthorStackCount = selectedAuthor
    ? (authorStacksTotal ?? getAuthorStackCount(selectedAuthor))
    : 0;

  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onDraftNameChange(event.currentTarget.value);
    },
    [onDraftNameChange]
  );

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <div className="h-full w-80 flex-shrink-0 border-r bg-white">
        <div className="h-full overflow-y-auto">
          <div className="border-b p-4">
            <h2 className="mb-3 text-lg font-semibold">{copy.title}</h2>

            <div className="space-y-3">
              <SmallSearchField
                value={searchQuery}
                onValueChange={onSearchChange}
                placeholder={copy.searchPlaceholder}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {safeSelectedMergeIds.size > 0
                      ? copy.selectedForMerge(safeSelectedMergeIds.size)
                      : copy.authorCount(safeAuthors.length)}
                  </span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onMerge}
                  disabled={!selectedAuthor || safeSelectedMergeIds.size === 0 || merging || saving}
                  className="h-7 w-full gap-1.5 px-2 text-xs"
                >
                  {merging ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  ) : (
                    <GitMerge className="h-3 w-3 shrink-0" />
                  )}
                  {copy.mergeIntoSelected}
                </Button>
              </div>
            </div>
          </div>

          <div className="p-2">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">{copy.loading}</div>
            ) : safeAuthors.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {copy.noAuthors}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {safeAuthors.map((author) => {
                  const authorId = getAuthorId(author);
                  const isSelected = selectedAuthorId === authorId;
                  const selectedForMerge = safeSelectedMergeIds.has(authorId);
                  const authorLinks = Array.isArray(author.links)
                    ? author.links
                    : EMPTY_AUTHOR_LINKS;
                  return (
                    <li
                      key={authorId}
                      onClick={() => onSelectAuthor(authorId)}
                      className={cn(
                        'group cursor-pointer rounded px-2 py-1.5 transition-colors',
                        isSelected
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{author.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {copy.stackCount(getAuthorStackCount(author))}
                            {authorLinks.length ? ` / ${authorLinks.length} ${copy.links}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-colors hover:bg-gray-100 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                            selectedForMerge && 'bg-blue-100 text-blue-700 opacity-100',
                            isSelected && 'cursor-not-allowed opacity-30 hover:bg-transparent'
                          )}
                          disabled={isSelected}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleMergeAuthor(authorId);
                          }}
                          title={
                            selectedForMerge ? copy.selectedMergeCandidate : copy.mergeCandidate
                          }
                        >
                          {selectedForMerge ? <Check size={14} /> : <GitMerge size={14} />}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {selectedAuthor ? (
        <div className="h-full min-w-0 flex-1 overflow-y-auto bg-gray-50">
          <div className="space-y-6 p-4">
            <div className="mb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold">{selectedAuthor.name}</h2>
                  <p className="mt-1 text-muted-foreground">
                    {copy.stackCount(selectedAuthorStackCount)}
                  </p>
                </div>
              </div>
            </div>

            <section className="max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="author-management-name">{copy.name}</Label>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onSave}
                      disabled={!draftName.trim() || saving || merging}
                      className="h-7 gap-1.5 px-2 text-xs"
                    >
                      {saving ? (
                        <Loader2 size={13} className="shrink-0 animate-spin" />
                      ) : (
                        <Save size={13} className="shrink-0" />
                      )}
                      {saving ? copy.saving : copy.save}
                    </Button>
                  </div>
                  <Input
                    id="author-management-name"
                    value={draftName}
                    onChange={handleNameChange}
                    disabled={saving || merging}
                    className="h-9"
                  />
                </div>

                <div className="grid gap-2 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{copy.links}</Label>
                    <span className="text-xs text-muted-foreground">
                      {copy.maxLinks(MAX_AUTHOR_LINKS)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedAuthorLinks.map((link) => (
                      <span key={link.id} className={authorLinkStyles.controlBase}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn('inline-flex items-center', authorLinkStyles.controlLink)}
                          title={link.url}
                        >
                          <LinkIcon size={12} className={authorLinkStyles.icon} />
                          <span className="truncate">{getAuthorLinkLabel(link)}</span>
                        </a>
                        <AuthorLinkQuickAdd
                          open={openLinkEditorId === link.id}
                          addLabel={copy.editLink}
                          urlLabel={copy.linkUrl}
                          urlPlaceholder={copy.linkUrlPlaceholder}
                          submitLabel={copy.updateLink}
                          submitting={linkSubmitting}
                          disabled={linkSubmitting}
                          initialUrl={link.url}
                          showPrefix={false}
                          showTriggerLabel={false}
                          triggerIcon={<Pencil size={11} />}
                          triggerTitle={copy.editLink}
                          triggerClassName={authorLinkStyles.controlAction}
                          onOpenChange={(open) => setOpenLinkEditorId(open ? link.id : null)}
                          onSubmit={(input) => onUpdateAuthorLink(link.id, input)}
                        />
                        <button
                          type="button"
                          className={cn(
                            authorLinkStyles.controlAction,
                            authorLinkStyles.controlDangerAction
                          )}
                          title={copy.removeLink}
                          disabled={linkSubmitting}
                          onClick={() => onRemoveAuthorLink(link.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </span>
                    ))}
                    {canAddLink && (
                      <AuthorLinkQuickAdd
                        open={openLinkEditorId === NEW_LINK_EDITOR_ID}
                        addLabel={copy.addLink}
                        urlLabel={copy.linkUrl}
                        urlPlaceholder={copy.linkUrlPlaceholder}
                        submitLabel={copy.addLink}
                        submitting={linkSubmitting}
                        disabled={linkSubmitting}
                        triggerClassName="min-h-7 px-2 text-xs leading-5"
                        onOpenChange={(open) =>
                          setOpenLinkEditorId(open ? NEW_LINK_EDITOR_ID : null)
                        }
                        onSubmit={onAddAuthorLink}
                      />
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{copy.assignedStacks}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {copy.stackCount(selectedAuthorStackCount)}
                </p>
              </div>

              {authorStacksLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {copy.loading}
                </div>
              ) : safeAuthorStacks.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  {copy.noAssignedStacks}
                </div>
              ) : (
                <>
                  <StackTileGrid
                    items={safeAuthorStacks}
                    datasetId={datasetId}
                    gridClassName="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                    cornerRadius="rounded"
                    isLoading={authorStacksLoadingMore}
                    isSelectionMode={stackSelectionMode}
                    selectedItems={selectedStackIds}
                    selectedActionCount={selectedStackActionCount}
                    getLinkElement={getStackLinkElement}
                    onEnterSelectionMode={onEnterStackSelectionMode}
                    onToggleSelection={onToggleStackSelection}
                    onSelectRange={onSelectStackRange}
                    onOpenItem={onOpenStack}
                    onDownloadItem={onDownloadStack}
                    onBulkEditSelected={onBulkEditSelectedStacks}
                    onDownloadSelected={onDownloadSelectedStacks}
                    onRemoveSelectedStacks={onRemoveSelectedStacks}
                  />
                  {authorStacksHasMore && !authorStacksLoadingMore ? (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onLoadMoreAuthorStacks}
                        className="h-8 px-3 text-xs"
                      >
                        {copy.loadMore}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-w-0 flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">
            <UserRound className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-lg text-muted-foreground">{copy.noAuthorSelected}</p>
          </div>
        </div>
      )}
    </div>
  );
}
