import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, onCompositionStart, onCompositionEnd, ...props }, ref) => {
    const composingRef = React.useRef(false);

    const handleCompositionStart = (e: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = true;
      onCompositionStart?.(e);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
      // small delay to ensure composition commit finished
      setTimeout(() => {
        composingRef.current = false;
      }, 0);
      onCompositionEnd?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        const isComposing =
          (e as any).isComposing || (e.nativeEvent as any)?.isComposing || composingRef.current;
        if (!isComposing) {
          // Blur without changing value
          (e.currentTarget as HTMLInputElement).blur();
          // Prevent global ESC handlers from triggering ("just blur")
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      onKeyDown?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
