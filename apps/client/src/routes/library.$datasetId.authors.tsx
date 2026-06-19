import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { AuthorManagementView } from '@/components/authors/AuthorManagementView';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { apiClient } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import type { Author, AuthorLink, MediaGridItem, Stack } from '@/types';

interface AuthorsSearch {
  authorId?: string;
}

interface AuthorDraftState {
  authorId: number;
  name: string;
}

export const Route = createFileRoute('/library/$datasetId/authors')({
  validateSearch: (search: Record<string, unknown>): AuthorsSearch => ({
    authorId: typeof search.authorId === 'string' ? search.authorId : undefined,
  }),
  component: AuthorsPage,
});

const normalizeAuthorId = (value: string | number) => Number(value);

const getAuthorLinks = (author: Author | null): AuthorLink[] =>
  Array.isArray(author?.links) ? author.links : [];

const toAuthorLinkPayload = (links: AuthorLink[]) =>
  links
    .map((link) => ({
      id: link.id,
      url: link.url.trim(),
    }))
    .filter((link) => link.url.length > 0);

const toMediaGridItem = (stack: Stack, datasetId: string): MediaGridItem => ({
  ...stack,
  dataSetId: datasetId,
  name: stack.name || String(stack.id),
  thumbnail: stack.thumbnail ?? stack.thumbnailUrl,
});

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

  const authors = Array.isArray(authorsQuery.data?.authors) ? authorsQuery.data.authors : [];
  const filteredAuthors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return authors;
    return authors.filter((author) => {
      const nameMatches = author.name.toLowerCase().includes(query);
      const links = Array.isArray(author.links) ? author.links : [];
      const linkMatches = links.some((link) => {
        const externalId = link.externalId?.toLowerCase() ?? '';
        return (
          externalId.includes(query) ||
          (link.url ?? '').toLowerCase().includes(query) ||
          (link.label ?? '').toLowerCase().includes(query)
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
    return null;
  }, [authors, routeAuthorId]);

  const selectedAuthorId = selectedAuthor ? normalizeAuthorId(selectedAuthor.id) : null;
  const selectedAuthorLinks = useMemo(() => getAuthorLinks(selectedAuthor), [selectedAuthor]);
  const activeDraft = draft && draft.authorId === selectedAuthorId ? draft : null;
  const draftName = activeDraft?.name ?? selectedAuthor?.name ?? '';

  const authorStacksQuery = useInfiniteQuery({
    queryKey: ['author-stacks', datasetId, selectedAuthorId, selectedAuthor?.name],
    queryFn: async ({ pageParam = 0 }) => {
      if (!selectedAuthor?.name) return { stacks: [], total: 0, limit: 50, offset: 0 };
      return apiClient.getStacksWithFilters({
        dataSetId: datasetId,
        author: [selectedAuthor.name],
        limit: 50,
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: Boolean(selectedAuthor?.name),
    initialPageParam: 0,
  });

  const authorStacks = useMemo(
    () =>
      (authorStacksQuery.data?.pages ?? [])
        .flatMap((page) => page.stacks)
        .map((stack) => toMediaGridItem(stack, datasetId)),
    [authorStacksQuery.data?.pages, datasetId]
  );

  const authorStacksTotal = authorStacksQuery.data?.pages[0]?.total;

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

  const addAuthorLinkMutation = useMutation({
    mutationFn: async (input: { url: string }) => {
      if (!selectedAuthorId) throw new Error('Author is not selected');
      return apiClient.addAuthorLink(selectedAuthorId, {
        datasetId,
        url: input.url,
      });
    },
    onSuccess: async () => {
      await invalidateAuthors();
    },
  });

  const updateAuthorLinksMutation = useMutation({
    mutationFn: async (links: AuthorLink[]) => {
      if (!selectedAuthorId) throw new Error('Author is not selected');
      return apiClient.updateAuthor(selectedAuthorId, {
        datasetId,
        links: toAuthorLinkPayload(links),
      });
    },
    onSuccess: async () => {
      await invalidateAuthors();
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
      const next = new Set(current ?? []);
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
      });
    },
    [selectedAuthorId]
  );

  const handleSave = useCallback(() => {
    if (!selectedAuthorId || !draftName.trim()) return;
    updateAuthorMutation.mutate();
  }, [draftName, selectedAuthorId, updateAuthorMutation]);

  const handleAddAuthorLink = useCallback(
    (input: { url: string }) => {
      if (!selectedAuthorId) return;
      addAuthorLinkMutation.mutate(input);
    },
    [addAuthorLinkMutation, selectedAuthorId]
  );

  const handleUpdateAuthorLink = useCallback(
    (linkId: AuthorLink['id'], input: { url: string }) => {
      if (!selectedAuthorId) return;
      const nextLinks = selectedAuthorLinks.map((link) =>
        link.id === linkId
          ? {
              ...link,
              url: input.url,
            }
          : link
      );
      updateAuthorLinksMutation.mutate(nextLinks);
    },
    [selectedAuthorId, selectedAuthorLinks, updateAuthorLinksMutation]
  );

  const handleRemoveAuthorLink = useCallback(
    (linkId: AuthorLink['id']) => {
      if (!selectedAuthorId) return;
      const nextLinks = selectedAuthorLinks.filter((link) => link.id !== linkId);
      updateAuthorLinksMutation.mutate(nextLinks);
    },
    [selectedAuthorId, selectedAuthorLinks, updateAuthorLinksMutation]
  );

  const handleLoadMoreAuthorStacks = useCallback(() => {
    if (!authorStacksQuery.hasNextPage || authorStacksQuery.isFetchingNextPage) return;
    void authorStacksQuery.fetchNextPage();
  }, [authorStacksQuery]);

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
      authorStacks={authorStacks}
      authorStacksTotal={authorStacksTotal}
      selectedMergeIds={selectedMergeIds}
      loading={authorsQuery.isLoading}
      authorStacksLoading={authorStacksQuery.isLoading}
      authorStacksLoadingMore={authorStacksQuery.isFetchingNextPage}
      authorStacksHasMore={Boolean(authorStacksQuery.hasNextPage)}
      saving={updateAuthorMutation.isPending}
      merging={mergeAuthorsMutation.isPending}
      linkSubmitting={addAuthorLinkMutation.isPending || updateAuthorLinksMutation.isPending}
      onSearchChange={setSearchQuery}
      onSelectAuthor={handleSelectAuthor}
      onToggleMergeAuthor={handleToggleMergeAuthor}
      onDraftNameChange={handleDraftNameChange}
      onAddAuthorLink={handleAddAuthorLink}
      onUpdateAuthorLink={handleUpdateAuthorLink}
      onRemoveAuthorLink={handleRemoveAuthorLink}
      onLoadMoreAuthorStacks={handleLoadMoreAuthorStacks}
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
        updateLink: t.authorManagement.updateLink,
        editLink: t.authorManagement.editLink,
        assignedStacks: t.authorManagement.assignedStacks,
        noAssignedStacks: t.authorManagement.noAssignedStacks,
        loadMore: t.common.loadMore,
        save: t.authorManagement.save,
        saving: t.authorManagement.saving,
        mergeIntoSelected: t.authorManagement.mergeIntoSelected,
        merging: t.authorManagement.merging,
      }}
    />
  );
}
