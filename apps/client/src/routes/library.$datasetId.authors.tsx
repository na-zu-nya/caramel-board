import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import type { AuthorLinkDraft } from '@/components/authors/AuthorLinkEditor';
import { AuthorManagementView } from '@/components/authors/AuthorManagementView';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import type { Author } from '@/types';

interface AuthorsSearch {
  authorId?: string;
}

interface AuthorDraftState {
  authorId: number;
  name: string;
  links: AuthorLinkDraft[];
}

export const Route = createFileRoute('/library/$datasetId/authors')({
  validateSearch: (search: Record<string, unknown>): AuthorsSearch => ({
    authorId: typeof search.authorId === 'string' ? search.authorId : undefined,
  }),
  component: AuthorsPage,
});

const normalizeAuthorId = (value: string | number) => Number(value);

const linkDraftsFromAuthor = (author: Author | null): AuthorLinkDraft[] =>
  (author?.links ?? []).map((link) => ({
    id: link.id,
    url: link.url,
  }));

function AuthorsPage() {
  const t = useT();
  const { datasetId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );
  useHeaderActions(headerActionsConfig);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<AuthorDraftState | null>(null);

  const authorsQuery = useQuery({
    queryKey: ['authors', datasetId, 'management'],
    queryFn: () => apiClient.getAuthors({ datasetId, limit: 1000, offset: 0 }),
  });

  const authors = authorsQuery.data?.authors ?? [];
  const filteredAuthors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return authors;
    return authors.filter((author) => {
      const nameMatches = author.name.toLowerCase().includes(query);
      const linkMatches = (author.links ?? []).some((link) => {
        const externalId = link.externalId?.toLowerCase() ?? '';
        return (
          externalId.includes(query) ||
          link.url.toLowerCase().includes(query) ||
          link.label.toLowerCase().includes(query)
        );
      });
      return nameMatches || linkMatches;
    });
  }, [authors, searchQuery]);

  const routeAuthorId = search.authorId ? Number.parseInt(search.authorId, 10) : null;
  const selectedAuthor = useMemo(() => {
    if (routeAuthorId && Number.isFinite(routeAuthorId)) {
      return authors.find((author) => normalizeAuthorId(author.id) === routeAuthorId) ?? null;
    }
    return filteredAuthors[0] ?? authors[0] ?? null;
  }, [authors, filteredAuthors, routeAuthorId]);

  const selectedAuthorId = selectedAuthor ? normalizeAuthorId(selectedAuthor.id) : null;
  const activeDraft = draft && draft.authorId === selectedAuthorId ? draft : null;
  const draftName = activeDraft?.name ?? selectedAuthor?.name ?? '';
  const draftLinks = activeDraft?.links ?? linkDraftsFromAuthor(selectedAuthor);

  const invalidateAuthors = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['authors', datasetId] }),
      queryClient.invalidateQueries({ queryKey: ['authors', datasetId, 'management'] }),
      queryClient.invalidateQueries({ queryKey: ['stacks'] }),
      queryClient.invalidateQueries({ queryKey: ['stack'] }),
    ]);
  }, [datasetId, queryClient]);

  const updateAuthorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAuthorId) throw new Error('Author is not selected');
      return apiClient.updateAuthor(selectedAuthorId, {
        datasetId,
        name: draftName.trim(),
        links: draftLinks
          .map((link) => ({
            id: link.id,
            url: link.url.trim(),
          }))
          .filter((link) => link.url.length > 0),
      });
    },
    onSuccess: async (author) => {
      setDraft(null);
      await invalidateAuthors();
      await navigate({
        to: '/library/$datasetId/authors',
        params: { datasetId },
        search: { authorId: String(author.id) },
      });
    },
  });

  const mergeAuthorsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAuthorId) throw new Error('Author is not selected');
      return apiClient.mergeAuthors({
        datasetId,
        targetAuthorId: selectedAuthorId,
        sourceAuthorIds: Array.from(selectedMergeIds),
      });
    },
    onSuccess: async (author) => {
      setDraft(null);
      setSelectedMergeIds(new Set());
      await invalidateAuthors();
      await navigate({
        to: '/library/$datasetId/authors',
        params: { datasetId },
        search: { authorId: String(author.id) },
      });
    },
  });

  const handleSelectAuthor = useCallback(
    (authorId: number) => {
      setDraft(null);
      setSelectedMergeIds(new Set());
      void navigate({
        to: '/library/$datasetId/authors',
        params: { datasetId },
        search: { authorId: String(authorId) },
      });
    },
    [datasetId, navigate]
  );

  const handleToggleMergeAuthor = useCallback((authorId: number) => {
    setSelectedMergeIds((current) => {
      const next = new Set(current);
      if (next.has(authorId)) {
        next.delete(authorId);
      } else {
        next.add(authorId);
      }
      return next;
    });
  }, []);

  const handleDraftNameChange = useCallback(
    (name: string) => {
      if (!selectedAuthorId) return;
      setDraft({
        authorId: selectedAuthorId,
        name,
        links: draftLinks,
      });
    },
    [draftLinks, selectedAuthorId]
  );

  const handleDraftLinksChange = useCallback(
    (links: AuthorLinkDraft[]) => {
      if (!selectedAuthorId) return;
      setDraft({
        authorId: selectedAuthorId,
        name: draftName,
        links,
      });
    },
    [draftName, selectedAuthorId]
  );

  const handleSave = useCallback(() => {
    if (!selectedAuthorId || !draftName.trim()) return;
    updateAuthorMutation.mutate();
  }, [draftName, selectedAuthorId, updateAuthorMutation]);

  const handleMerge = useCallback(() => {
    if (!selectedAuthor || selectedMergeIds.size === 0) return;
    const confirmed = window.confirm(
      t.authorManagement.mergeConfirm(selectedMergeIds.size, selectedAuthor.name)
    );
    if (!confirmed) return;
    mergeAuthorsMutation.mutate();
  }, [mergeAuthorsMutation, selectedAuthor, selectedMergeIds.size, t.authorManagement]);

  return (
    <AuthorManagementView
      authors={filteredAuthors}
      selectedAuthor={selectedAuthor}
      selectedAuthorId={selectedAuthorId}
      searchQuery={searchQuery}
      draftName={draftName}
      draftLinks={draftLinks}
      selectedMergeIds={selectedMergeIds}
      loading={authorsQuery.isLoading}
      saving={updateAuthorMutation.isPending}
      merging={mergeAuthorsMutation.isPending}
      onSearchChange={setSearchQuery}
      onSelectAuthor={handleSelectAuthor}
      onToggleMergeAuthor={handleToggleMergeAuthor}
      onDraftNameChange={handleDraftNameChange}
      onDraftLinksChange={handleDraftLinksChange}
      onSave={handleSave}
      onMerge={handleMerge}
      copy={{
        title: t.authorManagement.title,
        searchPlaceholder: t.authorManagement.searchPlaceholder,
        loading: t.authorManagement.loading,
        noAuthors: t.authorManagement.noAuthors,
        noAuthorSelected: t.authorManagement.noAuthorSelected,
        authorCount: t.authorManagement.authorCount,
        stackCount: t.authorManagement.stackCount,
        selectedForMerge: t.authorManagement.selectedForMerge,
        mergeCandidate: t.authorManagement.mergeCandidate,
        selectedMergeCandidate: t.authorManagement.selectedMergeCandidate,
        name: t.authorManagement.name,
        links: t.authorManagement.links,
        linkUrl: t.authorManagement.linkUrl,
        linkUrlPlaceholder: t.authorManagement.linkUrlPlaceholder,
        addLink: t.authorManagement.addLink,
        removeLink: t.authorManagement.removeLink,
        maxLinks: t.authorManagement.maxLinks,
        openLink: t.authorManagement.openLink,
        save: t.authorManagement.save,
        saving: t.authorManagement.saving,
        mergeIntoSelected: t.authorManagement.mergeIntoSelected,
        merging: t.authorManagement.merging,
      }}
    />
  );
}
