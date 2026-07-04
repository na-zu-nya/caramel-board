import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import StackViewer from '@/components/stack-viewer/StackViewer';

export const Route = createFileRoute('/library/$datasetId/stacks/$stackId')({
  component: StackViewerPage,
});

function StackViewerPage() {
  const { datasetId, stackId } = Route.useParams();
  const searchParams = Route.useSearch() as {
    category?: string;
    listToken?: string;
    returnTo?: string;
  };
  const category = searchParams.category || 'image';
  const location = useLocation();
  const isSimilar = location.pathname.endsWith('/similar');

  if (isSimilar) {
    return <Outlet />;
  }

  return (
    <StackViewer
      datasetId={datasetId}
      category={category as string}
      stackId={stackId}
      listToken={searchParams.listToken}
      returnTo={searchParams.returnTo}
    />
  );
}
