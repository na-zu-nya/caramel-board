import { createFileRoute } from '@tanstack/react-router';
import SetupPageContainer from '@/containers/setup/setup-page-container';

export const Route = createFileRoute('/setup')({
  validateSearch: (search: Record<string, unknown>) => {
    const preview = search.preview;
    return {
      preview:
        preview === true ||
        preview === 'true' ||
        preview === '1' ||
        preview === 1,
    };
  },
  component: SetupPage,
});

function SetupPage() {
  const { preview = false } = Route.useSearch();
  return <SetupPageContainer preview={preview} />;
}

export default SetupPage;
