import { useSyncExternalStore } from 'react';

export const SIDEBAR_FLOATING_MAX_WIDTH = 900;

const SIDEBAR_FLOATING_QUERY = `(max-width: ${SIDEBAR_FLOATING_MAX_WIDTH}px)`;

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const mediaQuery = window.matchMedia(SIDEBAR_FLOATING_QUERY);
  mediaQuery.addEventListener('change', callback);

  return () => {
    mediaQuery.removeEventListener('change', callback);
  };
}

function getSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(SIDEBAR_FLOATING_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useSidebarLayoutMode() {
  const isFloating = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isFloating };
}

export function useSidebarPushesContent(sidebarOpen: boolean) {
  const { isFloating } = useSidebarLayoutMode();
  return sidebarOpen && !isFloating;
}
