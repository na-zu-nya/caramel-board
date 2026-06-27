import { useSyncExternalStore } from 'react';

export const SIDEBAR_FLOATING_MAX_WIDTH = 900;
export const RIGHT_PANEL_FLOATING_MAX_WIDTH = 640;

const SIDEBAR_FLOATING_QUERY = `(max-width: ${SIDEBAR_FLOATING_MAX_WIDTH}px)`;
const RIGHT_PANEL_FLOATING_QUERY = `(max-width: ${RIGHT_PANEL_FLOATING_MAX_WIDTH}px)`;

function subscribeMediaQuery(query: string, callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const mediaQuery = window.matchMedia(query);
  mediaQuery.addEventListener('change', callback);

  return () => {
    mediaQuery.removeEventListener('change', callback);
  };
}

function getMediaQuerySnapshot(query: string) {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

function getServerSnapshot() {
  return false;
}

function useMediaQuerySnapshot(query: string) {
  return useSyncExternalStore(
    (callback) => subscribeMediaQuery(query, callback),
    () => getMediaQuerySnapshot(query),
    getServerSnapshot
  );
}

export function useSidebarLayoutMode() {
  const isFloating = useMediaQuerySnapshot(SIDEBAR_FLOATING_QUERY);
  return { isFloating };
}

export function useSidebarPushesContent(sidebarOpen: boolean) {
  const { isFloating } = useSidebarLayoutMode();
  return sidebarOpen && !isFloating;
}

export function useRightPanelLayoutMode() {
  const isFloating = useMediaQuerySnapshot(RIGHT_PANEL_FLOATING_QUERY);
  return { isFloating };
}

export function useRightPanelPushesContent(panelOpen: boolean) {
  const { isFloating } = useRightPanelLayoutMode();
  return panelOpen && !isFloating;
}
