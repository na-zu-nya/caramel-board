import { atom } from 'jotai';
import type { StackFilter } from '@/types';

// Helper function for sessionStorage
function loadFromSessionStorage(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const saved = sessionStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToSessionStorage(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

// Sidebar state with sessionStorage persistence
const sidebarOpenBaseAtom = atom(loadFromSessionStorage('sidebar-open', false));
export const sidebarOpenAtom = atom(
  (get) => get(sidebarOpenBaseAtom),
  (_get, set, newValue: boolean) => {
    set(sidebarOpenBaseAtom, newValue);
    saveToSessionStorage('sidebar-open', newValue);
  }
);

// Current dataset
export const currentDatasetAtom = atom<string | null>(null);

// Legacy: Pinned collections (max 5-6) - deprecated
export const pinnedCollectionIdsAtom = atom<string[]>([]);

// Filter state
export const filterOpenAtom = atom(false);

// Current filter state
export const currentFilterAtom = atom<StackFilter>({});

// Derived atom to check if filters are active
export const hasActiveFiltersAtom = atom((get) => {
  const filter = get(currentFilterAtom);
  return Object.keys(filter).some(
    (key) => key !== 'datasetId' && key !== 'mediaType' && filter[key as keyof StackFilter]
  );
});

// Selection mode state
export const selectionModeAtom = atom(false);

// Reorder mode state (for collections)
export const reorderModeAtom = atom(false);

// Header actions visibility
export const headerActionsAtom = atom<{
  showShuffle: boolean;
  showFilter: boolean;
  showSelection: boolean;
  showReorder?: boolean;
  onShuffle?: (() => void) | null;
}>({
  showShuffle: false,
  showFilter: false,
  showSelection: false,
  showReorder: false,
  onShuffle: null,
});

// Info sidebar state
// Info sidebar state with sessionStorage persistence
const infoSidebarOpenBaseAtom = atom(loadFromSessionStorage('info-open', false));
export const infoSidebarOpenAtom = atom(
  (get) => get(infoSidebarOpenBaseAtom),
  (_get, set, newValue: boolean) => {
    set(infoSidebarOpenBaseAtom, newValue);
    saveToSessionStorage('info-open', newValue);
  }
);

// Currently selected item for info sidebar
export const selectedItemIdAtom = atom<string | number | null>(null);

// Grid configuration
export const minColumnsAtom = atom(5);
export const minItemSizeAtom = atom(192);

// Custom color for color filter
export const customColorAtom = atom('#808080');
