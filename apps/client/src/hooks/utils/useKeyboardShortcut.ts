import { useEffect, useRef } from 'react';

type KeyCombo = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

type ShortcutHandler = (event: KeyboardEvent) => void;

/**
 * Single keyboard shortcut hook
 * @param keyCombo - The key combination to listen for
 * @param handler - The function to call when the key combination is pressed
 * @param options - Options for the shortcut
 */
export function useKeyboardShortcut(
  keyCombo: string | KeyCombo,
  handler: ShortcutHandler,
  options: {
    enabled?: boolean;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    ignoreInputs?: boolean;
  } = {}
) {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = false,
    ignoreInputs = true,
  } = options;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const normalizedCombo = normalizeKeyCombo(keyCombo);

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }
      }

      // Check if key combination matches
      if (isKeyComboMatch(event, normalizedCombo)) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        handlerRef.current(event);
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [enabled, keyCombo, preventDefault, stopPropagation, ignoreInputs]);
}

/**
 * Multiple keyboard shortcuts hook
 * @param shortcuts - Object mapping key combinations to handlers
 * @param options - Global options for all shortcuts
 */
export function useKeyboardShortcuts(
  shortcuts: Record<string, ShortcutHandler>,
  options: {
    enabled?: boolean;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    ignoreInputs?: boolean;
  } = {}
) {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = false,
    ignoreInputs = true,
  } = options;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const normalizedShortcuts = Object.entries(shortcuts).map(([key, handler]) => ({
      combo: normalizeKeyCombo(key),
      handler,
    }));

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }
      }

      // Check all shortcuts
      for (const { combo, handler } of normalizedShortcuts) {
        if (isKeyComboMatch(event, combo)) {
          if (preventDefault) event.preventDefault();
          if (stopPropagation) event.stopPropagation();
          handler(event);
          break; // Only trigger one shortcut per keypress
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [enabled, shortcuts, preventDefault, stopPropagation, ignoreInputs]);
}

// Helper functions
function normalizeKeyCombo(keyCombo: string | KeyCombo): KeyCombo {
  if (typeof keyCombo === 'object') {
    return keyCombo;
  }

  // Parse string shortcuts like "ctrl+shift+a" or "cmd+k"
  const parts = keyCombo.toLowerCase().split('+');
  const combo: KeyCombo = {
    key: parts[parts.length - 1],
  };

  for (const part of parts.slice(0, -1)) {
    switch (part) {
      case 'ctrl':
      case 'control':
        combo.ctrl = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'win':
      case 'windows':
        combo.meta = true;
        break;
    }
  }

  return combo;
}

function isKeyComboMatch(event: KeyboardEvent, combo: KeyCombo): boolean {
  const key = event.key.toLowerCase();
  const comboKey = combo.key.toLowerCase();

  // Special key mappings
  const keyMap: Record<string, string> = {
    esc: 'escape',
    return: 'enter',
    space: ' ',
  };

  const normalizedKey = keyMap[key] || key;
  const normalizedComboKey = keyMap[comboKey] || comboKey;

  return (
    normalizedKey === normalizedComboKey &&
    !!event.ctrlKey === !!combo.ctrl &&
    !!event.shiftKey === !!combo.shift &&
    !!event.altKey === !!combo.alt &&
    !!event.metaKey === !!combo.meta
  );
}
