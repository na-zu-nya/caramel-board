import { useAtom } from 'jotai';
import { filterOpenAtom, infoSidebarOpenAtom, selectionModeAtom } from '@/stores/ui';
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
  hasSelectedItems = false,
}: UseStackGridKeyboardShortcutsProps = {}) {
  const [filterOpen, setFilterOpen] = useAtom(filterOpenAtom);
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
      if (selectionMode && hasSelectedItems && onToggleEditPanel) {
        onToggleEditPanel();
        setInfoSidebarOpen(false);
        return;
      }

      if (!infoSidebarOpen && selectionMode) {
        setSelectionMode(false);
      }
      setInfoSidebarOpen(!infoSidebarOpen);
    },
    i: () => {
      if (selectionMode && hasSelectedItems && onToggleEditPanel) {
        onToggleEditPanel();
        setInfoSidebarOpen(false);
        return;
      }

      if (!infoSidebarOpen && selectionMode) {
        setSelectionMode(false);
      }
      setInfoSidebarOpen(!infoSidebarOpen);
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
        setFilterOpen(!filterOpen);
      }
    },
  };

  useGenericKeyboardShortcuts(shortcuts, {});
}
