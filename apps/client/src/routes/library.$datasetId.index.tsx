import {EntityCard} from '@/components/ui/Card/EntityCard';
import {TagChip} from '@/components/ui/Chip/TagChip';
import {SectionBlock, SectionHeader} from '@/components/ui/Section/Section';
import {StackTile} from '@/components/ui/Stack';
import {useDatasetOverview} from '@/hooks/useDatasetOverview';
import {useDataset} from '@/hooks/useDatasets';
import {useHeaderActions} from '@/hooks/useHeaderActions';
import {isScratchCollection} from '@/hooks/useScratch';
import {useStackTile} from '@/hooks/useStackTile';
import {apiClient} from '@/lib/api-client';
import {currentFilterAtom} from '@/stores/ui';
import type {MediaType} from '@/types';
import {useQuery} from '@tanstack/react-query';
import {createFileRoute, Link} from '@tanstack/react-router';
import {useAtom} from 'jotai';
import {BookOpen, Film, Image} from 'lucide-react';
import {useEffect, useMemo} from 'react';

export const Route = createFileRoute('/library/$datasetId/')({
  component: DatasetHome,
});

function DatasetHome() {
  const {datasetId} = Route.useParams();
  const [, setCurrentFilter] = useAtom(currentFilterAtom);
  const {data: dataset} = useDataset(datasetId);
  const {data: overview, isLoading} = useDatasetOverview(datasetId);
  const stackTileActions = useStackTile(datasetId);

  // Scratch detection (without creating one): find scratch collection and fetch recent items
  const {data: scratchData} = useQuery({
    queryKey: ['overview-scratch', datasetId],
    queryFn: async () => {
      const {collections} = await apiClient.getCollections({
        dataSetId: Number(datasetId),
        limit: 1000,
      });
      const scratch = collections.find((c) => isScratchCollection(c));
      if (!scratch) return null as null | { id: number; stacks: any[]; total: number };
      const res = await apiClient.getStacks({
        datasetId,
        filter: {collectionId: String(scratch.id)},
        sort: {field: 'updatedAt', order: 'desc'},
        limit: 10,
        offset: 0,
      });
      return {id: scratch.id, stacks: res.stacks, total: res.total};
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
    setCurrentFilter({datasetId});
  }, [datasetId, setCurrentFilter]);

  const mediaTypeConfig: Record<MediaType, { label: string; Icon: any }> = {
    image: {label: 'Images', Icon: Image},
    comic: {label: 'Comics', Icon: BookOpen},
    video: {label: 'Videos', Icon: Film},
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"/>
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
        <h1 className="text-4xl font-bold">{dataset?.name || 'Library'} Overview</h1>

        {/* Media Types Section */}
        <section>
          <SectionHeader title="Media Types"/>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {overview?.mediaTypes.map((media) => {
              const config = mediaTypeConfig[media.mediaType as MediaType];
              return (
                <EntityCard
                  key={media.mediaType}
                  asChild
                  aspect="16/9"
                  title={
                    <span className="flex items-center gap-2">
                      {config?.Icon && <config.Icon size={20}/>}
                      <span className="text-lg font-semibold">{config?.label}</span>
                    </span>
                  }
                  subtitle={`${media.count.toLocaleString()} items`}
                  thumbnailSrc={media.thumbnail || null}
                  icon={config?.Icon ? <config.Icon size={64} className="opacity-20"/> : undefined}
                >
                  <Link
                    to="/library/$datasetId/media-type/$mediaType"
                    params={{datasetId, mediaType: media.mediaType}}
                  />
                </EntityCard>
              );
            })}
          </div>
        </section>

        {/* Collections Section (exclude Scratch) */}
        {overview?.collections && overview.collections.length > 0 && (
          <section>
            <SectionHeader title="Collections"/>
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
            <SectionHeader title="Popular Tags"/>
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
                    search={{tags: [tag.name]}}
                  />
                </TagChip>
              ))}
            </div>
          </section>
        )}

        {/* Recent Likes Section */}
        {overview?.recentLikes && overview.recentLikes.length > 0 && (
          <SectionBlock
            title="Recently Liked"
            action={
              <Link
                to="/library/$datasetId/likes"
                params={{datasetId}}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Recently Liked ›
              </Link>
            }
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {overview.recentLikes.map((item) => {
                const {
                  onOpen,
                  onAddToScratch,
                  onFindSimilar,
                  onToggleFavorite,
                  onLike,
                  dragProps,
                } = stackTileActions;
                const thumb =
                  (item as any).thumbnail || (item as any).thumbnailUrl || '/no-image.png';
                const likeCount = Number(
                  (item as any).likeCount ?? (item as any).liked ?? 0
                );
                const pageCount =
                  (item as any).assetCount ??
                  (item as any)._count?.assets ??
                  (item as any).assetsCount ??
                  0;
                const currentFavorited =
                  (item as any).favorited ?? (item as any).isFavorite ?? false;
                return (
                  <StackTile
                    key={item.id}
                    thumbnailUrl={thumb}
                    pageCount={pageCount}
                    favorited={currentFavorited}
                    likeCount={likeCount}
                    onOpen={() => onOpen(item.id)}
                    onInfo={undefined}
                    onFindSimilar={() => onFindSimilar(item.id)}
                    onAddToScratch={() => onAddToScratch(item.id)}
                    onToggleFavorite={() => onToggleFavorite(item.id, currentFavorited)}
                    onLike={() => onLike(item.id)}
                    dragHandlers={dragProps(item.id)}
                    asChild
                  >
                    <Link
                      to="/library/$datasetId/stacks/$stackId"
                      params={{datasetId, stackId: String(item.id)}}
                    />
                  </StackTile>
                );
              })}
            </div>
          </SectionBlock>
        )}

        {/* Recently Scratch Section */}
        {scratchData?.stacks && scratchData.stacks.length > 0 && (
          <SectionBlock
            title="Recently Scratch"
            action={
              <Link
                to="/library/$datasetId/scratch/$scratchId"
                params={{datasetId, scratchId: String(scratchData.id)}}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Recently Scratch ›
              </Link>
            }
          >
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {scratchData.stacks.map((item) => {
                const {
                  onOpen,
                  onAddToScratch,
                  onFindSimilar,
                  onToggleFavorite,
                  onLike,
                  dragProps,
                } = stackTileActions;
                const thumb =
                  (item as any).thumbnail || (item as any).thumbnailUrl || '/no-image.png';
                const likeCount = Number(
                  (item as any).likeCount ?? (item as any).liked ?? 0
                );
                const pageCount =
                  (item as any).assetCount ??
                  (item as any)._count?.assets ??
                  (item as any).assetsCount ??
                  0;
                const currentFavorited =
                  (item as any).favorited ?? (item as any).isFavorite ?? false;
                return (
                  <StackTile
                    key={item.id}
                    thumbnailUrl={thumb}
                    pageCount={pageCount}
                    favorited={currentFavorited}
                    likeCount={likeCount}
                    onOpen={() => onOpen(item.id)}
                    onInfo={undefined}
                    onFindSimilar={() => onFindSimilar(item.id)}
                    onAddToScratch={() => onAddToScratch(item.id)}
                    onToggleFavorite={() => onToggleFavorite(item.id, currentFavorited)}
                    onLike={() => onLike(item.id)}
                    dragHandlers={dragProps(item.id)}
                    asChild
                  >
                    <Link
                      to="/library/$datasetId/stacks/$stackId"
                      params={{datasetId, stackId: String(item.id)}}
                    />
                  </StackTile>
                );
              })}
            </div>
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
  const {data: meta} = useQuery({
    queryKey: ['collection-meta', id],
    enabled: !thumbnail || !count,
    queryFn: async () => {
      // Try general stacks API first
      const res = await apiClient.getStacks({
        datasetId,
        filter: {collectionId: String(id)},
        sort: {field: 'updatedAt', order: 'desc'},
        limit: 1,
        offset: 0,
      });
      let s = res.stacks?.[0];
      let total = res.total as number;

      // Fallback for SMART collections where general filter may not apply
      if ((!s || total === 0) && typeof id === 'number') {
        try {
          const smart = await apiClient.getSmartCollectionStacks(id, {limit: 1, offset: 0});
          if (smart.total > 0) {
            s = smart.stacks?.[0] as any;
            total = smart.total;
          }
        } catch {
        }
      }

      const t = (s as any)?.thumbnailUrl || (s as any)?.thumbnail || null;
      return {thumb: t as string | null, total};
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
      subtitle={`${displayCount} items`}
      thumbnailSrc={src}
      icon={<span className="text-4xl">{icon}</span>}
    >
      <Link
        to="/library/$datasetId/collections/$collectionId"
        params={{datasetId, collectionId: String(id)}}
      />
    </EntityCard>
  );
}
