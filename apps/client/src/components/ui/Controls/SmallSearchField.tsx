import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SmallSearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

export function SmallSearchField({
  value,
  onValueChange,
  className,
  placeholder = 'Search...',
  ...rest
}: SmallSearchFieldProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        {...rest}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Respect IME
            if ((e as any).isComposing || (e.nativeEvent as any)?.isComposing) return;
            (e.currentTarget as HTMLInputElement).blur();
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        placeholder={placeholder}
        className={cn(
          'pl-8 h-8 text-sm w-full rounded-md border border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
      {value && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100"
          onClick={() => onValueChange('')}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-gray-500" />
        </button>
      )}
    </div>
  );
}
