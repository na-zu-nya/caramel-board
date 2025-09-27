import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SideMenuListItem, SideMenuMessage, SideMenuSearchField } from '@/components/ui/SideMenu';
import { apiClient } from '@/lib/api-client';

interface AutoTagsSectionProps {
  datasetId: string;
  autoFocusOnMount?: boolean;
}

interface AutoTagMappingItem {
  id: number;
  autoTagKey: string;
  displayName?: string;
  tag?: {
    id: number;
    title: string;
  };
}

export function AutoTagsSection({ datasetId, autoFocusOnMount = false }: AutoTagsSectionProps) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const { data, isLoading: isLoadingMappings } = useQuery<{
    mappings: AutoTagMappingItem[];
    total: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['autotag-mappings', datasetId],
    queryFn: async () => {
      return apiClient.getAutoTagMappings({ datasetId, limit: 200 });
    },
  });

  const { data: statisticsData, isFetching: isFetchingStatistics } = useQuery<{
    datasetId: number;
    threshold: number;
    totalTags: number;
    totalPredictions?: number;
    tags: Array<{ autoTagKey: string; predictionCount: number; assetCount: number }>;
    method: string;
    cached?: boolean;
  } | null>({
    queryKey: ['autotag-statistics', datasetId, trimmedQuery],
    queryFn: async () => {
      if (!trimmedQuery) return null;
      return apiClient.getAutoTagStatistics({
        datasetId,
        limit: 200,
        query: trimmedQuery,
        source: 'aggregate',
      });
    },
    enabled: isSearching,
  });

  const mappings = data?.mappings || [];
  const sortedMappings = useMemo(() => {
    return mappings.slice().sort((a, b) => {
      const aLabel = (a.displayName || a.autoTagKey || '').toLocaleLowerCase();
      const bLabel = (b.displayName || b.autoTagKey || '').toLocaleLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [mappings]);

  const filteredMappings = useMemo(() => {
    if (!isSearching) return sortedMappings;
    const lower = trimmedQuery.toLocaleLowerCase();
    return sortedMappings.filter((m) =>
      (m.displayName || m.autoTagKey || '').toLocaleLowerCase().includes(lower)
    );
  }, [sortedMappings, trimmedQuery, isSearching]);

  const displayItems = useMemo(() => {
    if (!isSearching) return sortedMappings;

    const base = filteredMappings.slice();
    const seen = new Set(base.map((m) => (m.autoTagKey ? m.autoTagKey.toLocaleLowerCase() : '')));

    if (statisticsData?.tags) {
      let virtualId = -1;
      for (const tag of statisticsData.tags) {
        const key = tag.autoTagKey;
        if (!key) continue;
        const lowerKey = key.toLocaleLowerCase();
        if (seen.has(lowerKey)) continue;
        base.push({
          id: virtualId,
          autoTagKey: key,
        });
        virtualId -= 1;
        seen.add(lowerKey);
      }
    }

    return base.sort((a, b) => {
      const aLabel = (a.displayName || a.autoTagKey || '').toLocaleLowerCase();
      const bLabel = (b.displayName || b.autoTagKey || '').toLocaleLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [filteredMappings, isSearching, sortedMappings, statisticsData]);

  const itemsToRender = isSearching ? displayItems : sortedMappings;
  const isLoading = isLoadingMappings || (isSearching && isFetchingStatistics);
  const showEmptyMessage = !isLoading && itemsToRender.length === 0;

  return (
    <div className="space-y-1">
      <SideMenuSearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Filter AutoTags..."
        autoFocusOnMount={autoFocusOnMount}
      />

      {isLoadingMappings && <SideMenuMessage variant="info">Loading auto-tags...</SideMenuMessage>}

      {!isLoadingMappings && isSearching && isFetchingStatistics && (
        <SideMenuMessage variant="info">Searching auto-tags...</SideMenuMessage>
      )}

      {showEmptyMessage && (
        <SideMenuMessage>{isSearching ? 'No matching AutoTags' : 'No AutoTags'}</SideMenuMessage>
      )}

      {!isLoading &&
        itemsToRender.map((m) => {
          const label = m.displayName || m.autoTagKey;
          return (
            <SideMenuListItem key={m.id} icon={Wand2} label={label} indent={1} asChild>
              <Link
                to="/library/$datasetId/autotag/$autoTagKey"
                params={{ datasetId, autoTagKey: encodeURIComponent(m.autoTagKey) }}
                activeProps={{ className: 'bg-gray-100 font-medium' }}
              />
            </SideMenuListItem>
          );
        })}
    </div>
  );
}
