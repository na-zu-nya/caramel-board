import { DroppableSideMenuItem } from '@/components/ui/DroppableSideMenuItem';
import { SideMenuMessage, SideMenuSearchField } from '@/components/ui/SideMenu';
import { apiClient } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Tag as TagIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TagsSectionProps {
  datasetId: string;
  autoFocusOnMount?: boolean;
}

interface TagItem {
  id: number;
  title: string;
  name?: string;
  _count?: {
    stacks: number;
  };
  stackCount?: number;
}

export function TagsSection({ datasetId, autoFocusOnMount = false }: TagsSectionProps) {
  const [limit, setLimit] = useState(20);
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<{
    tags: TagItem[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['tags', datasetId, limit],
    queryFn: async () => {
      const response = await apiClient.getTags({
        datasetId,
        orderBy: 'title',
        orderDirection: 'asc',
        limit,
      });
      return response;
    },
  });

  const hasMore = data && data.tags.length === limit;

  // Preserve scroll position across "Load more"
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
      scrollElRef.current.scrollTop = lastScrollTopRef.current;
      restoreScrollRef.current = false;
    }
  }, [isFetching]);

  const handleTagDrop = async (stackIds: number[], tagName: string) => {
    try {
      await apiClient.bulkAddTags(stackIds, [tagName]);

      // Invalidate both tags and stacks queries to refresh tag counts and stack data
      await queryClient.invalidateQueries({ queryKey: ['tags', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['tag-stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] });

      console.log(`✅ Added tag "${tagName}" to ${stackIds.length} stacks`);
    } catch (error) {
      console.error(`❌ Failed to add tag "${tagName}":`, error);
    }
  };

  if (isLoading || !data) {
    return <SideMenuMessage variant="info">Loading tags...</SideMenuMessage>;
  }

  // Safety net: ensure local alphabetical order by label even if API behavior changes
  const sortedTags = (data?.tags || []).slice().sort((a, b) => {
    const aName = (a.title || a.name || '').toLocaleLowerCase();
    const bName = (b.title || b.name || '').toLocaleLowerCase();
    return aName.localeCompare(bName);
  });

  const filteredTags = (() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return sortedTags;
    return sortedTags.filter((t) => (t.title || t.name || '').toLocaleLowerCase().includes(q));
  })();

  return (
    <div className="space-y-0.5">
      <SideMenuSearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Filter Tags..."
        autoFocusOnMount={autoFocusOnMount}
      />
      {filteredTags.map((tag) => {
        const tagName = tag.title || tag.name || '';
        const count = tag._count?.stacks || tag.stackCount || 0;
        return (
          <DroppableSideMenuItem
            key={tag.id}
            icon={TagIcon}
            label={tagName}
            count={count}
            indent={1}
            onStacksDrop={(stackIds) => handleTagDrop(stackIds, tagName)}
            asChild
          >
            <Link
              to="/library/$datasetId/tag/$tagName"
              params={{ datasetId, tagName }}
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
