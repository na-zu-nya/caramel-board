import { Grid3X3, Loader2 } from 'lucide-react';
import type { ChangeEvent, PointerEvent } from 'react';
import { useCallback } from 'react';
import {
  clampStackGridColumns,
  STACK_GRID_MAX_COLUMNS,
  STACK_GRID_MIN_COLUMNS,
} from '@/lib/grid-layout-settings';
import { cn } from '@/lib/utils';

interface GridColumnSliderProps {
  value: number;
  min?: number;
  max?: number;
  badgeLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  onChange: (value: number) => void;
}

export function GridColumnSlider({
  value,
  min = STACK_GRID_MIN_COLUMNS,
  max = STACK_GRID_MAX_COLUMNS,
  badgeLabel,
  disabled = false,
  loading = false,
  className,
  onChange,
}: GridColumnSliderProps) {
  const normalizedValue = clampStackGridColumns(value);
  const sliderValue = min + max - normalizedValue;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextSliderValue = Number.parseInt(event.currentTarget.value, 10);
      onChange(min + max - nextSliderValue);
    },
    [max, min, onChange]
  );

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className={cn(
        'fixed right-5 bottom-5 z-[35] flex min-w-[184px] items-center gap-2 rounded-lg border border-black/10 bg-white/90 px-2.5 py-1 text-gray-900 shadow-lg shadow-black/15 backdrop-blur-md transition-[right,bottom,opacity] duration-300 ease-in-out dark:border-white/10 dark:bg-neutral-900/90 dark:text-white',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      onPointerDown={handlePointerDown}
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/5 dark:bg-white/10">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Grid3X3 className="h-3.5 w-3.5" aria-hidden />
        )}
      </div>
      <input
        type="range"
        aria-label="Thumbnail size"
        min={min}
        max={max}
        step={1}
        value={sliderValue}
        disabled={disabled || loading}
        className="h-5 min-w-0 flex-1 accent-gray-900 dark:accent-white"
        onChange={handleChange}
      />
      {badgeLabel && (
        <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-white dark:text-gray-900">
          {badgeLabel}
        </span>
      )}
    </div>
  );
}
