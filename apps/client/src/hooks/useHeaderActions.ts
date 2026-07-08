import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { headerActionsAtom } from '@/stores/ui';

export interface HeaderActionsConfig {
  showShuffle: boolean;
  showFilter: boolean;
  showSelection: boolean;
  showReorder?: boolean;
  onShuffle?: (() => void) | null;
  enabled?: boolean;
}

export function useHeaderActions(config: HeaderActionsConfig) {
  const setHeaderActions = useSetAtom(headerActionsAtom);
  const enabled = config.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    setHeaderActions({
      showShuffle: config.showShuffle,
      showFilter: config.showFilter,
      showSelection: config.showSelection,
      showReorder: config.showReorder,
      onShuffle: config.onShuffle ?? null,
    });
  }, [
    setHeaderActions,
    config.showShuffle,
    config.showFilter,
    config.showSelection,
    config.showReorder,
    config.onShuffle,
    enabled,
  ]);

  // Clean up only when component actually unmounts
  useEffect(() => {
    return () => {
      setHeaderActions({
        showShuffle: false,
        showFilter: false,
        showSelection: false,
        showReorder: false,
        onShuffle: null,
      });
    };
  }, [setHeaderActions]);
}
