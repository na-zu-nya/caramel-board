import PinsPage from '@/components/PinsPage';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/library/$datasetId/pins')({
  component: PinsPage,
});
