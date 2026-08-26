import { atom } from 'jotai';
import type { StackFilter } from '@/types';

// Helper function for sessionStorage
function loadFromSessionStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const saved = sessionStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToSessionStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    // null は「未設定」を表すため、キー自体を削除する
    if (value === null) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
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

// Current dataset with sessionStorage persistence
const currentDatasetBaseAtom = atom(loadFromSessionStorage<string | null>('current-dataset', null));
export const currentDatasetAtom = atom(
  (get) => get(currentDatasetBaseAtom),
  (_get, set, newValue: string | null) => {
    set(currentDatasetBaseAtom, newValue);
    saveToSessionStorage('current-dataset', newValue);
  }
);

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
    (key) => key !== 'datasetId' && key !== 'category' && filter[key as keyof StackFilter]
  );
});

// Selection mode state
export const selectionModeAtom = atom(false);

// Reorder mode state (for collections)
export const reorderModeAtom = atom(false);

// Header actions visibility
export interface HeaderActionsState {
  showShuffle: boolean;
  showFilter: boolean;
  showSelection: boolean;
  showReorder?: boolean;
  onShuffle?: (() => void) | null;
  shuffleDisabled?: boolean;
  ownerId?: symbol;
}

export const EMPTY_HEADER_ACTIONS: HeaderActionsState = {
  showShuffle: false,
  showFilter: false,
  showSelection: false,
  showReorder: false,
  onShuffle: null,
  shuffleDisabled: false,
};

export const headerActionsAtom = atom<HeaderActionsState>(EMPTY_HEADER_ACTIONS);

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
export const selectedInfoAssetIdAtom = atom<string | number | null>(null);

// Grid configuration
export const minColumnsAtom = atom(5);
export const minItemSizeAtom = atom(192);

// Custom color for color filter
export const customColorAtom = atom('#808080');
