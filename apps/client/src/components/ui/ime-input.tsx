import { useIMEAwareKeyboard } from '@/hooks/useIMEAwareKeyboard';
import { cn } from '@/lib/utils';
import type React from 'react';
import { forwardRef } from 'react';

export interface IMEInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onKeyDown'> {
  onEnterKey?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const IMEInput = forwardRef<HTMLInputElement, IMEInputProps>(
  ({ className, onEnterKey, onKeyDown, onCompositionStart, onCompositionEnd, ...props }, ref) => {
    const { handleCompositionStart, handleCompositionEnd, createKeyDownHandler } =
      useIMEAwareKeyboard();

    const innerKeyDown = createKeyDownHandler(
      onEnterKey ? () => onEnterKey() : undefined,
      undefined
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if ((e as any).isComposing || (e.nativeEvent as any)?.isComposing) return;
        (e.currentTarget as HTMLInputElement).blur();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Delegate to IME-aware handler for Enter/etc.
      innerKeyDown(e);
      // Also forward to user onKeyDown afterwards
      onKeyDown?.(e);
    };

    const handleCompositionStartWrapper = (e: React.CompositionEvent<HTMLInputElement>) => {
      handleCompositionStart();
      onCompositionStart?.(e);
    };

    const handleCompositionEndWrapper = (e: React.CompositionEvent<HTMLInputElement>) => {
      handleCompositionEnd();
      onCompositionEnd?.(e);
    };

    return (
      <input
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStartWrapper}
        onCompositionEnd={handleCompositionEndWrapper}
        {...props}
      />
    );
  }
);

IMEInput.displayName = 'IMEInput';
