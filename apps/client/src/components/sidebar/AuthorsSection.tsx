import { DroppableSideMenuItem } from '@/components/ui/DroppableSideMenuItem';
import { SideMenuMessage, SideMenuSearchField } from '@/components/ui/SideMenu';
import { apiClient } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface AuthorsSectionProps {
  datasetId: string;
  autoFocusOnMount?: boolean;
}

interface AuthorItem {
  id: number;
  name: string;
  stackCount?: number;
  _count?: { stacks: number };
}

export function AuthorsSection({ datasetId, autoFocusOnMount = false }: AuthorsSectionProps) {
  const [limit, setLimit] = useState(20);
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<{
    authors: AuthorItem[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['authors', datasetId, limit],
    queryFn: async () => {
      return apiClient.getAuthors({ datasetId, limit, offset: 0 });
    },
  });

  const hasMore = !!data && data.authors.length === limit;

  // Keep scroll position when loading more
  const restoreScrollRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number>(0);

  const handleLoadMore = (e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      const el = (e.currentTarget as HTMLElement).closest('.overflow-y-auto') as HTMLElement | null;
      if (el) {
        scrollElRef.current = el;
        lastScrollTopRef.current = el.scrollTop;
        restoreScrollRef.current = true;
      }
    }
    setLimit((prev) => prev + 20);
  };

  useEffect(() => {
    if (!isFetching && restoreScrollRef.current && scrollElRef.current) {
      // Restore after data appended
      scrollElRef.current.scrollTop = lastScrollTopRef.current;
      restoreScrollRef.current = false;
    }
  }, [isFetching]);

  const handleAuthorDrop = async (stackIds: number[], authorName: string) => {
    try {
      await apiClient.bulkSetAuthor(stackIds, authorName);
      await queryClient.invalidateQueries({ queryKey: ['authors', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      console.log(`✅ Set author "${authorName}" to ${stackIds.length} stacks`);
    } catch (error) {
      console.error(`❌ Failed to set author "${authorName}":`, error);
    }
  };

  if (isLoading || !data) {
    return <SideMenuMessage variant="info">Loading authors...</SideMenuMessage>;
  }

  // Safety net sort by name (A-Z)
  const sortedAuthors = (data?.authors || [])
    .slice()
    .sort((a, b) => a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()));

  const filteredAuthors = (() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return sortedAuthors;
    return sortedAuthors.filter((a) => a.name.toLocaleLowerCase().includes(q));
  })();

  return (
    <div className="space-y-0.5">
      <SideMenuSearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Filter Authors..."
        autoFocusOnMount={autoFocusOnMount}
      />
      {filteredAuthors.map((author) => {
        const count = author.stackCount ?? author._count?.stacks ?? 0;
        const name = author.name;
        return (
          <DroppableSideMenuItem
            key={author.id}
            icon={User}
            label={name}
            count={count}
            indent={1}
            onStacksDrop={(stackIds) => handleAuthorDrop(stackIds, name)}
            asChild
          >
            <Link
              to="/library/$datasetId/author/$authorName"
              params={{ datasetId, authorName: name }}
              activeProps={{ className: 'bg-gray-100 font-medium' }}
            />
          </DroppableSideMenuItem>
        );
      })}
      {hasMore && !query && (
        <button
          type="button"
          onClick={(e) => handleLoadMore(e)}
          className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-gray-100 rounded transition-colors"
          style={{ paddingLeft: '2rem' }}
        >
          Load more...
        </button>
      )}
    </div>
  );
}
