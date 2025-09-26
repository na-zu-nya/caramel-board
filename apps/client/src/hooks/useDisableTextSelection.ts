import { useEffect } from 'react';

// Check if device supports touch
const isTouchDevice = () => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Check if element is an input/textarea or inside one
const isInputElement = (element: Element): boolean => {
  const inputTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  const contentEditableTags = ['[contenteditable="true"]', '[contenteditable=""]'];

  // Check if element itself is an input
  if (inputTags.includes(element.tagName)) {
    return true;
  }

  // Check if element has contenteditable
  if (
    element.hasAttribute('contenteditable') &&
    element.getAttribute('contenteditable') !== 'false'
  ) {
    return true;
  }

  // Check if element is inside an input or contenteditable
  return element.closest(inputTags.join(',') + ',' + contentEditableTags.join(',')) !== null;
};

export function useDisableTextSelection() {
  useEffect(() => {
    if (!isTouchDevice()) return;

    // Style to disable text selection
    const disableSelectionStyle = document.createElement('style');
    disableSelectionStyle.id = 'disable-text-selection';
    disableSelectionStyle.textContent = `
      /* Disable text selection on touch devices, except for input elements */
      * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      
      /* Re-enable selection for input elements */
      input, textarea, select, 
      [contenteditable="true"], 
      [contenteditable=""] {
        -webkit-touch-callout: default !important;
        -webkit-user-select: text !important;
        -khtml-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      
      /* Disable text selection during drag */
      .dragging * {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        -khtml-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
    `;

    document.head.appendChild(disableSelectionStyle);

    // Prevent text selection on touch start unless it's an input element
    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as Element;
      if (target && !isInputElement(target)) {
        // Don't prevent default to allow draggable elements to work
        // Just ensure text selection is disabled via CSS
        return;
      }
    };

    // Handle context menu on touch devices (often used for text selection)
    const handleContextMenu = (e: Event) => {
      const target = e.target as Element;
      if (target && !isInputElement(target)) {
        e.preventDefault();
      }
    };

    // Add event listeners
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      // Cleanup
      const styleElement = document.getElementById('disable-text-selection');
      if (styleElement) {
        document.head.removeChild(styleElement);
      }
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // Helper function to add dragging class to body
  const setDragging = (isDragging: boolean) => {
    if (isDragging) {
      document.body.classList.add('dragging');
    } else {
      document.body.classList.remove('dragging');
    }
  };

  return { setDragging, isTouchDevice: isTouchDevice() };
}
