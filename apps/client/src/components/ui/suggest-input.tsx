import { useIMEAwareKeyboard } from '@/hooks/useIMEAwareKeyboard';
import { cn } from '@/lib/utils';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<number | null>(null);
  const { handleCompositionStart, handleCompositionEnd, createKeyDownHandler } =
    useIMEAwareKeyboard();

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
    setIsOpen(true);
    debouncedSearch(newValue);
  };

  const handleSelectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    if (onSelect) {
      onSelect(suggestion);
    }
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = createKeyDownHandler(
    // Enter handler
    () => {
      if (!isOpen) return;

      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (onSelect && value.trim()) {
        onSelect(value.trim());
      }
    },
    // Other key handlers
    {
      ArrowDown: (e) => {
        if (!isOpen) return;
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
      },
      ArrowUp: (e) => {
        if (!isOpen) return;
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      },
      Escape: (e) => {
        // Respect IME composition; let ESC cancel composition
        if ((e as any).isComposing || (e.nativeEvent as any)?.isComposing) {
          return;
        }
        // Just blur the input; this will also close the suggestion list via onBlur
        inputRef.current?.blur();
        e.preventDefault();
        e.stopPropagation();
      },
    }
  );

  const handleBlur = () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleFocus = () => {
    setIsOpen(true);
    // Trigger search for empty query to show initial suggestions
    if (onSearch && !value.trim()) {
      onSearch('');
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
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
        autoFocus={autoFocus}
        className={cn(
          'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:border-primary focus:ring-1 focus:ring-primary',
          className
        )}
      />

      {isOpen && (suggestions.filter((s) => s && typeof s === 'string').length > 0 || loading) && (
        <ul
          ref={listRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-auto"
        >
          {loading && (
            <li key="loading" className="px-3 py-2 text-sm text-gray-500">
              Searching...
            </li>
          )}
          {!loading &&
            suggestions
              .filter((suggestion) => suggestion && typeof suggestion === 'string')
              .map((suggestion, index) => {
                return (
                  <li
                    key={`suggestion-${suggestion}`}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectSuggestion(suggestion);
                      }
                    }}
                    aria-selected={selectedIndex === index}
                    className={cn(
                      'px-3 py-2 text-sm cursor-pointer hover:bg-gray-100',
                      selectedIndex === index && 'bg-blue-100'
                    )}
                  >
                    {suggestion}
                  </li>
                );
              })}
          {!loading && suggestions.length === 0 && value.trim() && (
            <li key="no-results" className="px-3 py-2 text-sm text-gray-500">
              No suggestions found
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
