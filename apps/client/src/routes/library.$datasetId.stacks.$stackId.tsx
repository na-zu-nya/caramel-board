import StackViewer from '@/components/stack-viewer/StackViewer';
import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router';

export const Route = createFileRoute('/library/$datasetId/stacks/$stackId')({
  component: StackViewerPage,
});

function StackViewerPage() {
  const { datasetId, stackId } = Route.useParams();
  const searchParams = Route.useSearch() as { mediaType?: string; listToken?: string };
  const mediaType = searchParams.mediaType || 'image';
  const location = useLocation();
  const isSimilar = location.pathname.endsWith('/similar');

  if (isSimilar) {
    return <Outlet />;
  }

  return (
    <StackViewer
      datasetId={datasetId}
      mediaType={mediaType as string}
      stackId={stackId}
      listToken={searchParams.listToken}
    />
  );
}
