import type { MediaType, StackFilter } from '@/types';
import { atom } from 'jotai';

export type ViewContext = {
  token: string;
  datasetId: string;
  mediaType?: MediaType;
  filters?: StackFilter;
  sort?: { field: string; order: 'asc' | 'desc' };
  collectionId?: string;
  ids: number[]; // ordered stack ids window
  currentIndex: number; // index in ids
  createdAt: number;
};

const STORAGE_KEY_PREFIX = 'viewContext:';

export const viewContextAtom = atom<ViewContext | null>(null);

export function saveViewContext(ctx: ViewContext) {
  try {
    sessionStorage.setItem(STORAGE_KEY_PREFIX + ctx.token, JSON.stringify(ctx));
  } catch (e) {
    // ignore persistence failures
  }
}

export function loadViewContext(token: string): ViewContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + token);
    if (!raw) return null;
    return JSON.parse(raw) as ViewContext;
  } catch (e) {
    return null;
  }
}

export function genListToken(input: {
  datasetId: string;
  mediaType?: string;
  filters?: any;
  sort?: { field: string; order: 'asc' | 'desc' };
  collectionId?: string;
}) {
  const seed = JSON.stringify({
    d: input.datasetId,
    m: input.mediaType,
    f: input.filters,
    s: input.sort,
    c: input.collectionId,
    t: Date.now(),
  });
  // simple non-crypto hash
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return 'vc_' + (h >>> 0).toString(36);
}
