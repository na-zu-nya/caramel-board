import { useEffect } from 'react';

interface UseStackKeyboardShortcutsOptions {
  currentPage: number;
  totalPages: number;
  isInfoSidebarOpen: boolean;
  onPageChange: (page: number) => void;
  onListModeToggle: () => void;
  onInfoSidebarToggle: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  navigateBack: () => void;
  navigateShuffle: () => void;
}

export function useStackKeyboardShortcuts({
  onListModeToggle,
  onInfoSidebarToggle,
  onSwipeLeft,
  onSwipeRight,
  navigateBack,
  navigateShuffle,
}: UseStackKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          onSwipeRight(); // Right swipe = previous (left arrow)
          break;
        case 'ArrowRight':
          onSwipeLeft(); // Left swipe = next (right arrow)
          break;
        case 'Escape':
          navigateBack();
          break;
        case 'z':
          onListModeToggle();
          break;
        case 'e':
          onInfoSidebarToggle();
          break;
        case 's':
          navigateShuffle();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onListModeToggle,
    onInfoSidebarToggle,
    onSwipeLeft,
    onSwipeRight,
    navigateBack,
    navigateShuffle,
  ]);
}
