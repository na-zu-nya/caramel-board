import type {MediaGridItem, StackFilter} from '@/types';
import {atom} from 'jotai';

interface NavigationState {
  scrollPosition: number;
  total: number;
  items: (MediaGridItem | undefined)[];
  lastPath: string;
  filter?: StackFilter;
  sort?: { field: string; order: 'asc' | 'desc' };
}

// ナビゲーション状態を保存するatom
export const navigationStateAtom = atom<NavigationState | null>(null);
