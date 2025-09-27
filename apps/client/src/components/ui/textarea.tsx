import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onKeyDown, onCompositionStart, onCompositionEnd, ...props }, ref) => {
    const composingRef = React.useRef(false);

    const handleCompositionStart = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = true;
      onCompositionStart?.(e);
    };

    const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      setTimeout(() => {
        composingRef.current = false;
      }, 0);
      onCompositionEnd?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        const isComposing =
          (e as any).isComposing || (e.nativeEvent as any)?.isComposing || composingRef.current;
        if (!isComposing) {
          (e.currentTarget as HTMLTextAreaElement).blur();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      onKeyDown?.(e);
    };

    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
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
Textarea.displayName = 'Textarea';

export { Textarea };
