import { createFileRoute } from '@tanstack/react-router';
import PinsPage from '@/components/PinsPage';

export const Route = createFileRoute('/library/$datasetId/pins')({
  component: PinsPage,
});
