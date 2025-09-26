import { useCallback, useRef } from 'react';

/**
 * Custom hook for handling keyboard events with IME (Input Method Editor) awareness.
 * Particularly handles Safari's behavior where IME confirmation sends keyCode 229.
 */
export function useIMEAwareKeyboard() {
  const isComposingRef = useRef(false);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    // Delay to ensure the composition is fully complete
    setTimeout(() => {
      isComposingRef.current = false;
    }, 0);
  }, []);

  const createKeyDownHandler = useCallback(
    (
      onEnter?: (e: React.KeyboardEvent) => void,
      otherHandlers?: Record<string, (e: React.KeyboardEvent) => void>
    ) => {
      return (e: React.KeyboardEvent) => {
        // Safari sends keyCode 229 for IME Enter key
        if (e.keyCode === 229) {
          return;
        }

        // Check if we have a handler for the specific key
        if (otherHandlers?.[e.key]) {
          otherHandlers[e.key](e);
          return;
        }

        // Handle Enter key with composition check
        if (e.key === 'Enter') {
          // Also check the composition state
          if (isComposingRef.current) {
            return;
          }

          if (onEnter) {
            e.preventDefault();
            onEnter(e);
          }
        }
      };
    },
    []
  );

  return {
    handleCompositionStart,
    handleCompositionEnd,
    createKeyDownHandler,
    isComposing: isComposingRef.current,
  };
}
