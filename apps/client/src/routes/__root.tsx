import {useDatasets} from '@/hooks/useDatasets';
import { apiClient } from '@/lib/api-client';
import {useThemeColor} from '@/hooks/useThemeColor';
import {useKeyboardShortcuts as useGenericKeyboardShortcuts} from '@/hooks/utils/useKeyboardShortcut';
import {cn} from '@/lib/utils';
import {currentDatasetAtom, selectionModeAtom, sidebarOpenAtom} from '@/stores/ui';
import {createRootRoute, Outlet, useParams, useNavigate, useLocation} from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {TanStackRouterDevtools} from '@tanstack/react-router-devtools';
import {useAtom} from 'jotai';

import {UploadProgress} from '@/components/ui/upload-progress';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import {DragProvider} from '@/contexts/DragContext';
import Header from '@/containers/header-container';
import Sidebar from '@/containers/sidebar-container';
import InfoSidebar from '../components/InfoSidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Run upload queue globally (single runner)
  useUploadQueue();
  const [sidebarOpen, setSidebarOpen] = useAtom(sidebarOpenAtom);
  const [currentDataset, setCurrentDataset] = useAtom(currentDatasetAtom);
  const [, setSelectionMode] = useAtom(selectionModeAtom);
  const { data: datasets = [] } = useDatasets();
  const params = useParams({ strict: false });
  const location = useLocation();
  const isSetupRoute = location.pathname === '/setup';
  
  // Route-bound dataset id (only present on dataset pages)
  const routeDatasetId = params.datasetId as string | undefined;
  // Determine default dataset from list
  const defaultDatasetId = useMemo(
    () => (datasets.find((d) => (d as any).isDefault)?.id as string | undefined),
    [datasets]
  );
  // On root (no route dataset) and no current selection, adopt default if any
  useEffect(() => {
    if (!routeDatasetId && !currentDataset && defaultDatasetId) {
      setCurrentDataset(defaultDatasetId);
    }
  }, [routeDatasetId, currentDataset, defaultDatasetId, setCurrentDataset]);

  // Selected dataset for theming (prefer route dataset, then current, then default)
  const selectedDataset = datasets.find(
    (d) => String(d.id) === String(routeDatasetId || currentDataset || defaultDatasetId || '')
  );

  // Only check protection when a dataset is explicitly in the route
  const { data: protectionStatus, isLoading: protectionLoading } = useQuery({
    queryKey: ['dataset-protection', routeDatasetId],
    queryFn: () => apiClient.getDatasetProtectionStatus(routeDatasetId as string),
    enabled: !!routeDatasetId,
  });
  const isProtected = protectionStatus?.isProtected;
  const isAuthorized = protectionStatus?.authorized;
  const [passwordInput, setPasswordInput] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Apply theme color
  useThemeColor(selectedDataset?.themeColor);

  // Update document title to include current dataset name
  useEffect(() => {
    const baseTitle = 'CaramelBoard 🍬🤎';
    if (selectedDataset?.name) {
      document.title = `${selectedDataset.name} — ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [selectedDataset?.name]);

  // Global keyboard shortcuts
  useGenericKeyboardShortcuts(
    {
      q: () => {
        setSidebarOpen(!sidebarOpen);
      },
    },
    {}
  );

  // Reset multi-selection mode when navigating between pages (pathname change)
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      setSelectionMode(false);
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, setSelectionMode]);

  return (
    <DragProvider>
      {!isSetupRoute && <Header />}
      <div className={cn('flex min-h-screen', isSetupRoute && 'bg-gray-50')}>
        {!isSetupRoute && <Sidebar />}
        <main
          className={cn(
            'flex-1 transition-all duration-300 ease-in-out',
            isSetupRoute ? 'pt-0 ml-0' : ['pt-14', sidebarOpen ? 'ml-80' : 'ml-0']
          )}
        >
          {protectionLoading ? (
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      {!isSetupRoute && (
        <>
          <UploadProgress />
          {/* Keep InfoSidebar mounted globally; open/close via classes for smooth transitions */}
          <InfoSidebar />
        </>
      )}
      <TanStackRouterDevtools />

      {/* Password Modal */}
      <Dialog
        open={Boolean(!isSetupRoute && routeDatasetId && isProtected && !isAuthorized)}
        onOpenChange={(open) => {
          if (!open) {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              void navigate({ to: '/' });
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlock Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Enter the password to view this library.</p>
            <Input
              type="password"
              value={passwordInput}
              placeholder="Password"
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && passwordInput) {
                  try {
                    await apiClient.authDataset(routeDatasetId as string, passwordInput);
                    setPasswordInput('');
                    await queryClient.invalidateQueries({ queryKey: ['dataset-protection', routeDatasetId] });
                  } catch {
                    alert('Invalid password');
                  }
                }
              }}
            />
            <Button
              onClick={async () => {
                try {
                  await apiClient.authDataset(routeDatasetId as string, passwordInput);
                  setPasswordInput('');
                  await queryClient.invalidateQueries({ queryKey: ['dataset-protection', routeDatasetId] });
                } catch {
                  alert('Invalid password');
                }
              }}
              disabled={!passwordInput}
            >
              Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DragProvider>
  );
}
