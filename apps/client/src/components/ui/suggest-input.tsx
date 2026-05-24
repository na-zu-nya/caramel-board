import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIMEAwareKeyboard } from '@/hooks/useIMEAwareKeyboard';
import { cn } from '@/lib/utils';

interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  placeholder?: string;
  className?: string;
  suggestions: string[];
  loading?: boolean;
  onSearch?: (query: string) => void;
  autoFocus?: boolean;
}

export function SuggestInput({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  suggestions,
  loading = false,
  onSearch,
  autoFocus = false,
}: SuggestInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<number | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const { handleCompositionStart, handleCompositionEnd, createKeyDownHandler } =
    useIMEAwareKeyboard();
  const visibleSuggestions = useMemo(
    () => suggestions.filter((suggestion) => suggestion && typeof suggestion === 'string'),
    [suggestions]
  );
  const shouldShowList =
    isOpen && (loading || visibleSuggestions.length > 0 || Boolean(value.trim()));

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        if (onSearch && query.trim().length >= 1) {
          onSearch(query.trim());
        }
      }, 300);
    },
    [onSearch]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      clearBlurTimeout();
      onChange(newValue);
      setSelectedIndex(-1);
      setIsOpen(true);
      debouncedSearch(newValue);
    },
    [clearBlurTimeout, debouncedSearch, onChange]
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: string) => {
      clearBlurTimeout();
      onChange(suggestion);
      if (onSelect) {
        onSelect(suggestion);
      }
      setIsOpen(false);
      setSelectedIndex(-1);
      inputRef.current?.focus();
    },
    [clearBlurTimeout, onChange, onSelect]
  );

  const handleEnter = useCallback(() => {
    if (!isOpen) return;

    if (selectedIndex >= 0 && visibleSuggestions[selectedIndex]) {
      handleSelectSuggestion(visibleSuggestions[selectedIndex]);
    } else if (onSelect && value.trim()) {
      onSelect(value.trim());
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  }, [handleSelectSuggestion, isOpen, onSelect, selectedIndex, value, visibleSuggestions]);

  const handleKeyDown = useMemo(() => {
    return createKeyDownHandler(handleEnter, {
      ArrowDown: (e) => {
        if (!isOpen) return;
        e.preventDefault();
        setSelectedIndex((prev) => (prev < visibleSuggestions.length - 1 ? prev + 1 : prev));
      },
      ArrowUp: (e) => {
        if (!isOpen) return;
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      },
      Escape: (e) => {
        // Respect IME composition; let ESC cancel composition
        if (e.nativeEvent.isComposing) {
          return;
        }
        // Just blur the input; this will also close the suggestion list via onBlur
        inputRef.current?.blur();
        e.preventDefault();
        e.stopPropagation();
      },
    });
  }, [createKeyDownHandler, handleEnter, isOpen, visibleSuggestions.length]);

  const handleBlur = useCallback(() => {
    clearBlurTimeout();
    blurTimeoutRef.current = window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) {
        return;
      }
      setIsOpen(false);
      setSelectedIndex(-1);
      blurTimeoutRef.current = null;
    }, 200);
  }, [clearBlurTimeout]);

  const handleFocus = useCallback(() => {
    clearBlurTimeout();
    setIsOpen(true);
    // Trigger search for empty query to show initial suggestions
    if (onSearch && !value.trim()) {
      onSearch('');
    }
  }, [clearBlurTimeout, onSearch, value]);

  const handleSuggestionPress = useCallback((event: React.SyntheticEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleSuggestionClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const suggestion = event.currentTarget.dataset.suggestion;
      if (suggestion) {
        handleSelectSuggestion(suggestion);
      }
    },
    [handleSelectSuggestion]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      clearBlurTimeout();
    };
  }, [clearBlurTimeout]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [autoFocus]);

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:border-primary focus:ring-1 focus:ring-primary',
          className
        )}
      />

      {shouldShowList && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto"
        >
          {loading && (
            <li key="loading" className="px-3 py-2 text-sm text-gray-500">
              Searching...
            </li>
          )}
          {!loading &&
            visibleSuggestions.map((suggestion, index) => {
              return (
                <li key={`suggestion-${suggestion}`} aria-selected={selectedIndex === index}>
                  <button
                    type="button"
                    data-suggestion={suggestion}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-sm hover:bg-gray-100',
                      selectedIndex === index && 'bg-blue-100'
                    )}
                    onMouseDown={handleSuggestionPress}
                    onPointerDown={handleSuggestionPress}
                    onClick={handleSuggestionClick}
                  >
                    {suggestion}
                  </button>
                </li>
              );
            })}
          {!loading && visibleSuggestions.length === 0 && value.trim() && (
            <li key="no-results" className="px-3 py-2 text-sm text-gray-500">
              No suggestions found
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
