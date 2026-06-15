import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import reportWebVitals from './reportWebVitals';
// Import the generated route tree
import { routeTree } from './routeTree.gen';
import '@fontsource/tilt-warp/400.css';
import '@fontsource/murecho/500.css';
import './styles.css';

type AppLanguage = 'en' | 'ja';

declare global {
  interface Window {
    __CARAMEL_DEFAULT_LANGUAGE__?: AppLanguage;
  }
}

const languageStorageKey = 'caramelboard.language';

const isAppLanguage = (value: string | undefined | null): value is AppLanguage =>
  value === 'en' || value === 'ja';

const getDefaultLanguage = (): AppLanguage => {
  if (isAppLanguage(window.__CARAMEL_DEFAULT_LANGUAGE__)) {
    return window.__CARAMEL_DEFAULT_LANGUAGE__;
  }
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
};

const applyInitialLanguage = () => {
  if (isAppLanguage(window.__CARAMEL_DEFAULT_LANGUAGE__)) {
    window.localStorage.setItem(languageStorageKey, window.__CARAMEL_DEFAULT_LANGUAGE__);
    document.documentElement.lang = window.__CARAMEL_DEFAULT_LANGUAGE__;
    return;
  }

  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  const language = isAppLanguage(storedLanguage) ? storedLanguage : getDefaultLanguage();
  if (!isAppLanguage(storedLanguage)) {
    window.localStorage.setItem(languageStorageKey, language);
  }
  document.documentElement.lang = language;
};

applyInitialLanguage();

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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
