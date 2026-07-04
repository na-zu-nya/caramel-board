import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { Film, Image, Images } from 'lucide-react';
import { SideMenuListItem } from '@/components/ui/SideMenu';
import { apiClient } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import type { MediaType } from '@/types';

interface MediaTypesSectionProps {
  datasetId: string;
}

export function MediaTypesSection({ datasetId }: MediaTypesSectionProps) {
  const t = useT();

  const { data: counts } = useQuery({
    queryKey: ['media-type-counts', datasetId],
    queryFn: async () => {
      const [image, video, multipleImages] = await Promise.all([
        apiClient.getStacks({
          datasetId,
          filter: { mediaTypes: ['image'] },
          limit: 1,
          offset: 0,
        }),
        apiClient.getStacks({
          datasetId,
          filter: { mediaTypes: ['video'] },
          limit: 1,
          offset: 0,
        }),
        apiClient.getStacks({
          datasetId,
          filter: { mediaTypes: ['multipleImages'] },
          limit: 1,
          offset: 0,
        }),
      ]);
      return {
        image: image.total || 0,
        video: video.total || 0,
        multipleImages: multipleImages.total || 0,
      } as const;
    },
    enabled: !!datasetId,
    staleTime: 5000,
  });

  const MEDIA_TYPE_ITEMS: Array<{ type: MediaType; icon: LucideIcon; label: string }> = [
    { type: 'image', icon: Image, label: t.sidebar.mediaTypeImage },
    { type: 'video', icon: Film, label: t.sidebar.mediaTypeVideo },
    { type: 'multipleImages', icon: Images, label: t.sidebar.mediaTypeMultipleImages },
  ];

  return (
    <div className="space-y-0.5">
      {MEDIA_TYPE_ITEMS.map((item) => (
        <SideMenuListItem
          key={item.type}
          asChild
          icon={item.icon}
          label={item.label}
          count={counts?.[item.type]}
          indent={1}
        >
          <Link
            to="/library/$datasetId/media-types/$type"
            params={{ datasetId, type: item.type }}
            activeProps={{ className: 'bg-gray-100 font-medium' }}
          />
        </SideMenuListItem>
      ))}
    </div>
  );
}
