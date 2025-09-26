import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import { Filter, X } from 'lucide-react';

export interface SideMenuSearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  autoFocusOnMount?: boolean;
  className?: string;
}

export function SideMenuSearchField({
  value,
  onValueChange,
  placeholder = 'Filter... ',
  autoFocusOnMount = true,
  className,
}: SideMenuSearchFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusOnMount) {
      const id = requestAnimationFrame(() => inputRef.current?.focus?.());
      return () => cancelAnimationFrame(id);
    }
  }, [autoFocusOnMount]);

  return (
    <div className={cn('relative mr-2', className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if ((e as any).isComposing || (e.nativeEvent as any)?.isComposing) return;
            (e.currentTarget as HTMLInputElement).blur();
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        placeholder={placeholder}
        className="w-full px-7 pr-6 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-primary focus:border-primary"
      />
      <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
      {value && (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
          aria-label="Clear filter"
        >
          <X className="h-3.5 w-3.5 text-gray-500" />
        </button>
      )}
    </div>
  );
}
