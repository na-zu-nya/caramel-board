import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/library/$datasetId')({
  component: DatasetLayout,
});

function DatasetLayout() {
  return <Outlet />;
}
