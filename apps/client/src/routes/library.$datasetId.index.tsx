import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useAtom } from 'jotai';
import { BookOpen, Film, Image, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { StackTileGrid } from '@/components/StackTileGrid';
import { EntityCard } from '@/components/ui/Card/EntityCard';
import { TagChip } from '@/components/ui/Chip/TagChip';
import { SectionBlock, SectionHeader } from '@/components/ui/Section/Section';
import { useDatasetOverview } from '@/hooks/useDatasetOverview';
import { useDataset } from '@/hooks/useDatasets';
import { useHeaderActions } from '@/hooks/useHeaderActions';
import { isScratchCollection } from '@/hooks/useScratch';
import { useStackTile } from '@/hooks/useStackTile';
import { apiClient } from '@/lib/api-client';
import { getMediaTypeLabel, useT } from '@/lib/i18n';
import { currentFilterAtom } from '@/stores/ui';
import type { MediaCategory, Stack } from '@/types';

type StackCardItem = {
  id: string | number;
  name?: string;
  title?: string;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  likeCount?: string | number | null;
  liked?: string | number | null;
  assetCount?: number | null;
  assetsCount?: number | null;
  _count?: { assets?: number | null };
  favorited?: boolean | null;
  isFavorite?: boolean | null;
  mediaType?: string | null;
  originalName?: unknown;
  file?: unknown;
  url?: unknown;
  preview?: unknown;
  assets?: unknown;
};

export const Route = createFileRoute('/library/$datasetId/')({
  component: DatasetHome,
});

function DatasetHome() {
  const t = useT();
  const { datasetId } = Route.useParams();
  const [, setCurrentFilter] = useAtom(currentFilterAtom);
  const { data: dataset } = useDataset(datasetId);
  const { data: overview, isLoading } = useDatasetOverview(datasetId);
  const { onOpen, onFindSimilar, onAddToScratch, onDownload, onToggleFavorite, onLike, dragProps } =
    useStackTile(datasetId);

  // Scratch detection (without creating one): find scratch collection and fetch recent items
  const { data: scratchData } = useQuery({
    queryKey: ['overview-scratch', datasetId],
    queryFn: async () => {
      const { collections } = await apiClient.getCollections({
        dataSetId: Number(datasetId),
        limit: 1000,
      });
      const scratch = collections.find((c) => isScratchCollection(c));
      if (!scratch) return null as null | { id: number; stacks: Stack[]; total: number };
      const res = await apiClient.getStacks({
        datasetId,
        filter: { collectionId: String(scratch.id) },
        sort: { field: 'updated', order: 'desc' },
        limit: 10,
        offset: 0,
      });
      return { id: scratch.id, stacks: res.stacks, total: res.total };
    },
    staleTime: 5000,
  });

  // Hide header actions on dataset overview page
  const headerActionsConfig = useMemo(
    () => ({
      showShuffle: false,
      showFilter: false,
      showSelection: false,
    }),
    []
  );

  useHeaderActions(headerActionsConfig);

  // Reset filter when landing on dataset overview
  useEffect(() => {
    setCurrentFilter({ datasetId });
  }, [datasetId, setCurrentFilter]);

  const mediaTypeConfig: Record<MediaCategory, { label: string; Icon: LucideIcon }> = {
    image: { label: getMediaTypeLabel(t, 'image'), Icon: Image },
    comic: { label: getMediaTypeLabel(t, 'comic'), Icon: BookOpen },
    video: { label: getMediaTypeLabel(t, 'video'), Icon: Film },
  };

  const recentLikeItems = useMemo<StackCardItem[]>(
    () => overview?.recentLikes ?? [],
    [overview?.recentLikes]
  );
  const scratchItems = useMemo<StackCardItem[]>(
    () => scratchData?.stacks ?? [],
    [scratchData?.stacks]
  );

  const getStackLinkElement = useCallback(
    (item: StackCardItem) => (
      <Link
        to="/library/$datasetId/stacks/$stackId"
        params={{ datasetId, stackId: String(item.id) }}
      />
    ),
    [datasetId]
  );

  const handleOpenStack = useCallback(
    async (item: StackCardItem) => {
      await onOpen(item.id);
    },
    [onOpen]
  );

  const handleFindSimilarStack = useCallback(
    async (item: StackCardItem) => {
      await onFindSimilar(item.id);
    },
    [onFindSimilar]
  );

  const handleAddToScratchStack = useCallback(
    async (item: StackCardItem) => {
      await onAddToScratch(item.id);
    },
    [onAddToScratch]
  );

  const handleDownloadStack = useCallback(
    (item: StackCardItem) => {
      onDownload(item.id);
    },
    [onDownload]
  );

  const handleToggleFavoriteStack = useCallback(
    async (item: StackCardItem, favorited: boolean) => {
      await onToggleFavorite(item.id, favorited);
    },
    [onToggleFavorite]
  );

  const handleLikeStack = useCallback(
    async (item: StackCardItem) => {
      await onLike(item.id);
    },
    [onLike]
  );

  const getStackDragHandlers = useCallback(
    (item: StackCardItem, sourceImageUrl: string | null, sourceImageFilename: string | undefined) =>
      dragProps(item.id, sourceImageUrl, sourceImageFilename),
    [dragProps]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen transition-all duration-300 ease-in-out"
      style={{
        backgroundColor: dataset?.themeColor
          ? `color-mix(in oklch, ${dataset.themeColor} 5%, white)`
          : 'white',
      }}
    >
      <div className="container mx-auto px-4 py-6 pt-8 pb-24 space-y-8">
        <h1 className="text-4xl font-bold">
          {dataset?.name || t.sidebar.library} {t.overview.title}
        </h1>

        {/* Media Types Section */}
        <section>
          <SectionHeader title={t.overview.mediaTypes} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {overview?.mediaTypes.map((media) => {
              const config = mediaTypeConfig[media.mediaType as MediaCategory];
              return (
                <EntityCard
                  key={media.mediaType}
                  asChild
                  aspect="16/9"
                  title={
                    <span className="flex items-center gap-2">
                      {config?.Icon && <config.Icon size={20} />}
                      <span className="text-lg font-semibold">{config?.label}</span>
                    </span>
                  }
                  subtitle={t.library.itemCount(media.count)}
                  thumbnailSrc={media.thumbnail || null}
                  icon={config?.Icon ? <config.Icon size={64} className="opacity-20" /> : undefined}
                >
                  <Link
                    to="/library/$datasetId/media-type/$mediaType"
                    params={{ datasetId, mediaType: media.mediaType }}
                  />
                </EntityCard>
              );
            })}
          </div>
        </section>

        {/* Collections Section (exclude Scratch) */}
        {overview?.collections && overview.collections.length > 0 && (
          <section>
            <SectionHeader title={t.sidebar.collections} />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {overview.collections
                .filter((c) => !isScratchCollection(c))
                .map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    datasetId={datasetId}
                    id={collection.id}
                    name={collection.name}
                    icon={collection.icon}
                    count={collection.count}
                    thumbnail={collection.thumbnail}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Tag Cloud Section */}
        {overview?.tagCloud && overview.tagCloud.length > 0 && (
          <section>
            <SectionHeader title={t.overview.popularTags} />
            <div className="flex flex-wrap gap-2">
              {overview.tagCloud.slice(0, 30).map((tag) => (
                <TagChip
                  key={tag.id}
                  asChild
                  name={tag.name}
                  displayName={tag.displayName || undefined}
                  count={tag.count}
                >
                  <Link
                    to="/library/$datasetId/media-type/$mediaType"
                    params={(): { datasetId: string; mediaType: 'image' } => ({
                      datasetId,
                      mediaType: 'image',
                    })}
                    search={{ tags: [tag.name] }}
                  />
                </TagChip>
              ))}
            </div>
          </section>
        )}

        {/* Recent Likes Section */}
        {recentLikeItems.length > 0 && (
          <SectionBlock
            title={t.overview.recentlyLiked}
            action={
              <Link
                to="/library/$datasetId/likes"
                params={{ datasetId }}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                {t.overview.recentlyLiked} ›
              </Link>
            }
          >
            <StackTileGrid
              items={recentLikeItems}
              datasetId={datasetId}
              gridClassName="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
              cornerRadius="rounded"
              getLinkElement={getStackLinkElement}
              onOpenItem={handleOpenStack}
              onFindSimilarItem={handleFindSimilarStack}
              onAddToScratchItem={handleAddToScratchStack}
              onDownloadItem={handleDownloadStack}
              onToggleFavoriteItem={handleToggleFavoriteStack}
              onLikeItem={handleLikeStack}
              getDragHandlers={getStackDragHandlers}
            />
          </SectionBlock>
        )}

        {/* Recently Scratch Section */}
        {scratchData && scratchItems.length > 0 && (
          <SectionBlock
            title={t.overview.recentlyScratch}
            action={
              <Link
                to="/library/$datasetId/scratch/$scratchId"
                params={{ datasetId, scratchId: String(scratchData.id) }}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                {t.overview.recentlyScratch} ›
              </Link>
            }
          >
            <StackTileGrid
              items={scratchItems}
              datasetId={datasetId}
              gridClassName="grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
              cornerRadius="rounded"
              getLinkElement={getStackLinkElement}
              onOpenItem={handleOpenStack}
              onFindSimilarItem={handleFindSimilarStack}
              onAddToScratchItem={handleAddToScratchStack}
              onDownloadItem={handleDownloadStack}
              onToggleFavoriteItem={handleToggleFavoriteStack}
              onLikeItem={handleLikeStack}
              getDragHandlers={getStackDragHandlers}
            />
          </SectionBlock>
        )}
      </div>
    </div>
  );
}

// A small card component for collections that fetches a fallback thumbnail
function CollectionCard({
  datasetId,
  id,
  name,
  icon,
  count,
  thumbnail,
}: {
  datasetId: string;
  id: number;
  name: string;
  icon: string;
  count: number;
  thumbnail?: string | null;
}) {
  const t = useT();
  const { data: meta } = useQuery({
    queryKey: ['collection-meta', id],
    enabled: !thumbnail || !count,
    queryFn: async () => {
      // Try general stacks API first
      const res = await apiClient.getStacks({
        datasetId,
        filter: { collectionId: String(id) },
        sort: { field: 'updated', order: 'desc' },
        limit: 1,
        offset: 0,
      });
      let s = res.stacks?.[0];
      let total = res.total as number;

      // Fallback for SMART collections where general filter may not apply
      if ((!s || total === 0) && typeof id === 'number') {
        try {
          const smart = await apiClient.getSmartCollectionStacks(id, { limit: 1, offset: 0 });
          if (smart.total > 0) {
            s = smart.stacks?.[0];
            total = smart.total;
          }
        } catch {}
      }

      const t = s?.thumbnailUrl || s?.thumbnail || null;
      return { thumb: t, total };
    },
    staleTime: 30000,
  });

  const src = thumbnail || meta?.thumb || null;
  const displayCount = count && count > 0 ? count : (meta?.total ?? 0);

  return (
    <EntityCard
      asChild
      aspect="1/1"
      title={name}
      subtitle={t.library.itemCount(displayCount)}
      thumbnailSrc={src}
      icon={<span className="text-4xl">{icon}</span>}
    >
      <Link
        to="/library/$datasetId/collections/$collectionId"
        params={{ datasetId, collectionId: String(id) }}
      />
    </EntityCard>
  );
}
