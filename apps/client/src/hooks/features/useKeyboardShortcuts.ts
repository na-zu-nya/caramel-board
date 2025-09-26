import { filterOpenAtom, infoSidebarOpenAtom, selectionModeAtom } from '@/stores/ui';
import { useAtom } from 'jotai';
import { useKeyboardShortcuts as useGenericKeyboardShortcuts } from '../utils/useKeyboardShortcut';

interface UseStackGridKeyboardShortcutsProps {
  isEditPanelOpen?: boolean;
  onToggleEditPanel?: () => void;
  hasSelectedItems?: boolean;
}

/**
 * Stack Grid specific keyboard shortcuts
 * This is a specialized version for the Stack Grid component
 */
export function useKeyboardShortcuts({
  onToggleEditPanel,
  hasSelectedItems: _hasSelectedItems = false,
}: UseStackGridKeyboardShortcutsProps = {}) {
  const [, setFilterOpen] = useAtom(filterOpenAtom);
  const [selectionMode, setSelectionMode] = useAtom(selectionModeAtom);
  const [infoSidebarOpen, setInfoSidebarOpen] = useAtom(infoSidebarOpenAtom);

  const shortcuts = {
    w: () => {
      // Toggle selection mode (multiple selection)
      // If turning on selection mode, turn off info sidebar
      if (!selectionMode) {
        setInfoSidebarOpen(false);
      }
      setSelectionMode(!selectionMode);
    },
    e: () => {
      // If in selection mode and have items selected, open edit panel
      if (selectionMode && onToggleEditPanel) {
        onToggleEditPanel();
      } else {
        // Toggle info sidebar (single selection)
        // If turning on info sidebar, turn off selection mode
        if (!infoSidebarOpen && selectionMode) {
          setSelectionMode(false);
        }
        setInfoSidebarOpen((prev: boolean) => !prev);
      }
    },
    escape: () => {
      // Exit selection mode with Escape key
      if (selectionMode) {
        setSelectionMode(false);
      }
    },
    f: () => {
      // Toggle filter panel (only if not in selection mode)
      if (!selectionMode) {
        setFilterOpen((prev: boolean) => !prev);
      }
    },
  };

  useGenericKeyboardShortcuts(shortcuts, {});
}
