// Removed MediaTypeContextMenu (pin/unpin) for Images/Comics/Videos per UX update
// import {OverviewContextMenu} from '@/components/modals/OverviewContextMenu';
import { DroppableSidebarItem } from '@/components/sidebar/DroppableSidebarItem';
import { SideMenuGroup, SideMenuListItem } from '@/components/ui/SideMenu';
import { cn } from '@/lib/utils';
import { DroppableSideMenuItem } from '@/components/ui/DroppableSideMenuItem';
import { TagsSection } from '@/components/sidebar/TagsSection';
import { AutoTagsSection } from '@/components/sidebar/AutoTagsSection';
import { AuthorsSection } from '@/components/sidebar/AuthorsSection';
import type { LibrarySectionProps } from '@/components/sidebar/types';
import { apiClient } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NotebookText,
  BookOpen,
  Film,
  Heart,
  Home,
  Image,
  Star,
  Tag,
  User,
  ChevronRight,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useScratch } from '@/hooks/useScratch';
import { ScratchContextMenu } from '@/components/modals/ScratchContextMenu';
import { Link, useNavigate, useLocation } from '@tanstack/react-router';

export function LibrarySection({
  datasetId,
  isCollapsed = false,
  onToggle,
  isPinned,
  onPinMediaType,
  onUnpinMediaType,
  onPinOverview,
  onUnpinOverview,
}: LibrarySectionProps) {
  const queryClient = useQueryClient();
  const { scratch, ensureScratch } = useScratch(datasetId);
  const navigate = useNavigate();
  const location = useLocation();

  // Counts (Favorites, Likes, MediaTypes, Scratch)
  const { data: counts } = useQuery({
    queryKey: ['library-counts', datasetId, scratch?.id ?? 'no-scratch'],
    queryFn: async () => {
      const [fav, liked, img, com, vid, scr] = await Promise.all([
        apiClient.getStacks({ datasetId, filter: { isFavorite: true }, limit: 1, offset: 0 }),
        apiClient.getStacks({ datasetId, filter: { isLiked: true }, limit: 1, offset: 0 }),
        apiClient.getStacks({ datasetId, filter: { mediaType: 'image' }, limit: 1, offset: 0 }),
        apiClient.getStacks({ datasetId, filter: { mediaType: 'comic' }, limit: 1, offset: 0 }),
        apiClient.getStacks({ datasetId, filter: { mediaType: 'video' }, limit: 1, offset: 0 }),
        scratch?.id
          ? apiClient.getStacks({
              datasetId,
              filter: { collectionId: String(scratch.id) },
              limit: 1,
              offset: 0,
            })
          : Promise.resolve({ total: 0 } as any),
      ]);
      return {
        favorites: fav.total || 0,
        likes: liked.total || 0,
        image: img.total || 0,
        comic: com.total || 0,
        video: vid.total || 0,
        scratch: scr.total || 0,
      } as const;
    },
    enabled: !!datasetId,
    staleTime: 5000,
  });

  // Load tags collapsed state from sessionStorage
  const [tagsCollapsed, setTagsCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(`tagsCollapsed-${datasetId}`);
    return stored !== null ? stored === 'true' : true;
  });
  const prevTagsCollapsed = useRef<boolean | null>(null);

  // Save tags collapsed state to sessionStorage
  const toggleTagsCollapsed = () => {
    const newState = !tagsCollapsed;
    setTagsCollapsed(newState);
    sessionStorage.setItem(`tagsCollapsed-${datasetId}`, String(newState));
  };

  // AutoTags collapsed state
  const [autoTagsCollapsed, setAutoTagsCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(`autoTagsCollapsed-${datasetId}`);
    return stored !== null ? stored === 'true' : true;
  });
  const prevAutoTagsCollapsed = useRef<boolean | null>(null);

  const toggleAutoTagsCollapsed = () => {
    const newState = !autoTagsCollapsed;
    setAutoTagsCollapsed(newState);
    sessionStorage.setItem(`autoTagsCollapsed-${datasetId}`, String(newState));
  };

  // Authors collapsed state
  const [authorsCollapsed, setAuthorsCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(`authorsCollapsed-${datasetId}`);
    return stored !== null ? stored === 'true' : true;
  });
  const prevAuthorsCollapsed = useRef<boolean | null>(null);

  // Track previous collapsed states to detect "open" transitions after mount
  useEffect(() => {
    prevTagsCollapsed.current = tagsCollapsed;
    prevAutoTagsCollapsed.current = autoTagsCollapsed;
    prevAuthorsCollapsed.current = authorsCollapsed;
  }, []);
  useEffect(() => {
    prevTagsCollapsed.current = tagsCollapsed;
  }, [tagsCollapsed]);
  useEffect(() => {
    prevAutoTagsCollapsed.current = autoTagsCollapsed;
  }, [autoTagsCollapsed]);
  useEffect(() => {
    prevAuthorsCollapsed.current = authorsCollapsed;
  }, [authorsCollapsed]);

  const toggleAuthorsCollapsed = () => {
    const newState = !authorsCollapsed;
    setAuthorsCollapsed(newState);
    sessionStorage.setItem(`authorsCollapsed-${datasetId}`, String(newState));
  };

  // Drop handlers
  const handleFavoriteDrop = async (stackIds: number[]) => {
    try {
      await apiClient.bulkSetFavorite(stackIds, true);

      // Invalidate all stack-related queriesを通じて最新のカウントを取得
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['tag-stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] });

      console.log(`✅ Added ${stackIds.length} stacks to favorites`);
    } catch (error) {
      console.error('❌ Failed to add to favorites:', error);
    }
  };

  const handleMediaTypeDrop = async (
    stackIds: number[],
    mediaType: 'image' | 'comic' | 'video'
  ) => {
    try {
      await apiClient.bulkSetMediaType(stackIds, mediaType);

      // Invalidate all stack-related queries to refresh media type filters
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['tag-stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['autotag-stacks'] });

      console.log(`✅ Set ${stackIds.length} stacks to ${mediaType} media type`);
    } catch (error) {
      console.error(`❌ Failed to set media type to ${mediaType}:`, error);
    }
  };

  // Scratch へのドロップ
  const handleScratchDrop = async (stackIds: number[]) => {
    try {
      const sc = scratch || (await ensureScratch());
      await apiClient.bulkAddStacksToCollection(sc.id, stackIds);
      await queryClient.invalidateQueries({ queryKey: ['stacks'] });
      await queryClient.invalidateQueries({ queryKey: ['collection', sc.id] });
      await queryClient.invalidateQueries({ queryKey: ['collection-folders', datasetId] });
      await queryClient.invalidateQueries({ queryKey: ['library-counts', datasetId] });
      console.log(`✅ Added ${stackIds.length} stacks to Scratch`);
    } catch (error) {
      console.error('❌ Failed to add to Scratch:', error);
    }
  };

  return (
    <SideMenuGroup label="Library" collapsed={isCollapsed} onToggle={onToggle}>
      <nav className="space-y-0.5">
        <SideMenuListItem
          asChild
          icon={Home}
          label="Overview"
          enableContextMenu
          pinnable
          pinned={isPinned('OVERVIEW')}
          onPin={() => onPinOverview?.('Home', 'Overview')}
          onUnpin={onUnpinOverview}
        >
          <Link
            to="/library/$datasetId"
            params={() => ({ datasetId })}
            activeOptions={{ exact: true }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>

        <DroppableSideMenuItem
          asChild
          icon={Star}
          label="Favorites"
          count={counts?.favorites}
          onStacksDrop={handleFavoriteDrop}
        >
          <Link
            to="/library/$datasetId/favorites"
            params={{ datasetId }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </DroppableSideMenuItem>

        <SideMenuListItem asChild icon={Heart} label="Likes" count={counts?.likes}>
          <Link
            to="/library/$datasetId/likes"
            params={{ datasetId }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>

        {/* Scratch */}
        <ScratchContextMenu datasetId={datasetId} scratchId={scratch?.id}>
          <DroppableSideMenuItem
            onClick={async () => {
              const sc = scratch || (await ensureScratch());
              navigate({
                to: '/library/$datasetId/scratch/$scratchId',
                params: { datasetId, scratchId: String(sc.id) },
              });
            }}
            icon={NotebookText}
            label="Scratch"
            count={counts?.scratch}
            onStacksDrop={handleScratchDrop}
            acceptDrop
            active={location.pathname.includes(`/library/${datasetId}/scratch/`)}
          />
        </ScratchContextMenu>

        <DroppableSideMenuItem
          asChild
          icon={Image}
          label="Images"
          count={counts?.image}
          onStacksDrop={(stackIds) => handleMediaTypeDrop(stackIds, 'image')}
          enableContextMenu
          pinnable
          pinned={isPinned('MEDIA_TYPE', undefined as any, 'image')}
          onPin={() => onPinMediaType?.('image', 'Image', 'Images')}
          onUnpin={() => onUnpinMediaType?.('image')}
        >
          <Link
            to="/library/$datasetId/media-type/$mediaType"
            params={{ datasetId, mediaType: 'image' }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </DroppableSideMenuItem>

        <DroppableSideMenuItem
          asChild
          icon={BookOpen}
          label="Comics"
          count={counts?.comic}
          onStacksDrop={(stackIds) => handleMediaTypeDrop(stackIds, 'comic')}
          enableContextMenu
          pinnable
          pinned={isPinned('MEDIA_TYPE', undefined as any, 'comic')}
          onPin={() => onPinMediaType?.('comic', 'BookOpen', 'Comics')}
          onUnpin={() => onUnpinMediaType?.('comic')}
        >
          <Link
            to="/library/$datasetId/media-type/$mediaType"
            params={{ datasetId, mediaType: 'comic' }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </DroppableSideMenuItem>

        <DroppableSideMenuItem
          asChild
          icon={Film}
          label="Videos"
          count={counts?.video}
          onStacksDrop={(stackIds) => handleMediaTypeDrop(stackIds, 'video')}
          enableContextMenu
          pinnable
          pinned={isPinned('MEDIA_TYPE', undefined as any, 'video')}
          onPin={() => onPinMediaType?.('video', 'Film', 'Videos')}
          onUnpin={() => onUnpinMediaType?.('video')}
        >
          <Link
            to="/library/$datasetId/media-type/$mediaType"
            params={{ datasetId, mediaType: 'video' }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </DroppableSideMenuItem>

        <SideMenuListItem
          label={
            (
              <span className="flex items-center gap-1.5">
                <Tag size={15} />
                <span>Tags</span>
              </span>
            ) as any
          }
          right={
            <ChevronRight
              size={14}
              className={cn('ml-1 transition-transform', !tagsCollapsed && 'rotate-90')}
            />
          }
          onClick={toggleTagsCollapsed}
        />
        {!tagsCollapsed && (
          <div className="mt-0.5 ml-2">
            <TagsSection
              datasetId={datasetId}
              autoFocusOnMount={prevTagsCollapsed.current === true}
            />
          </div>
        )}

        <SideMenuListItem
          label={
            (
              <span className="flex items-center gap-1.5">
                <Tag size={15} />
                <span>AutoTags</span>
              </span>
            ) as any
          }
          right={
            <ChevronRight
              size={14}
              className={cn('ml-1 transition-transform', !autoTagsCollapsed && 'rotate-90')}
            />
          }
          onClick={toggleAutoTagsCollapsed}
        />
        {!autoTagsCollapsed && (
          <div className="mt-0.5 ml-2">
            <AutoTagsSection
              datasetId={datasetId}
              autoFocusOnMount={prevAutoTagsCollapsed.current === true}
            />
          </div>
        )}

        <SideMenuListItem
          label={
            (
              <span className="flex items-center gap-1.5">
                <User size={15} />
                <span>Authors</span>
              </span>
            ) as any
          }
          right={
            <ChevronRight
              size={14}
              className={cn('ml-1 transition-transform', !authorsCollapsed && 'rotate-90')}
            />
          }
          onClick={toggleAuthorsCollapsed}
        />
        {!authorsCollapsed && (
          <div className="mt-0.5 ml-2">
            <AuthorsSection
              datasetId={datasetId}
              autoFocusOnMount={prevAuthorsCollapsed.current === true}
            />
          </div>
        )}
      </nav>
    </SideMenuGroup>
  );
}
