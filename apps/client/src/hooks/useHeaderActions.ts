import { useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { EMPTY_HEADER_ACTIONS, headerActionsAtom } from '@/stores/ui';

export interface HeaderActionsConfig {
  showShuffle: boolean;
  showFilter: boolean;
  showSelection: boolean;
  showReorder?: boolean;
  onShuffle?: (() => void) | null;
  shuffleDisabled?: boolean;
  enabled?: boolean;
}

export function useHeaderActions(config: HeaderActionsConfig) {
  const setHeaderActions = useSetAtom(headerActionsAtom);
  const enabled = config.enabled ?? true;
  const ownerIdRef = useRef(Symbol('header-actions-owner'));

  useEffect(() => {
    const ownerId = ownerIdRef.current;
    const clearIfOwned = () => {
      setHeaderActions((current) => (current.ownerId === ownerId ? EMPTY_HEADER_ACTIONS : current));
    };

    if (!enabled) {
      clearIfOwned();
      return;
    }

    setHeaderActions({
      showShuffle: config.showShuffle,
      showFilter: config.showFilter,
      showSelection: config.showSelection,
      showReorder: config.showReorder,
      onShuffle: config.onShuffle ?? null,
      shuffleDisabled: config.shuffleDisabled ?? false,
      ownerId,
    });

    return clearIfOwned;
  }, [
    setHeaderActions,
    config.showShuffle,
    config.showFilter,
    config.showSelection,
    config.showReorder,
    config.onShuffle,
    config.shuffleDisabled,
    enabled,
  ]);
}
