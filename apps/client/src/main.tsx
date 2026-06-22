import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import the generated route tree
import { applyBrowserRenderingProfile } from './lib/browser-rendering';
import { initializeLanguagePreference } from './lib/language';
import { installThumbnailBlurConsoleCommand } from './lib/thumbnail-blur';
import { routeTree } from './routeTree.gen';
import '@fontsource/tilt-warp/400.css';
import '@fontsource/murecho/500.css';
import './styles.css';

const applyInitialLanguage = () => {
  initializeLanguagePreference({
    storage: window.localStorage,
    document,
    defaultLanguage: window.__CARAMEL_DEFAULT_LANGUAGE__,
    navigatorLanguage: navigator.language,
  });
};

applyInitialLanguage();
applyBrowserRenderingProfile(document, navigator);
installThumbnailBlurConsoleCommand(window);

// Create a QueryClient instance
const queryClient = new QueryClient();

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  );
}
