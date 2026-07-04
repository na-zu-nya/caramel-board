import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const ACTIVE_TEXT_COLOR = 'color-mix(in oklch, var(--primary) 50%, black)';

export interface HeaderIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  variant?: 'default' | 'active' | 'highlight';
  badge?: boolean;
  badgeColor?: string;
}

const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  (
    {
      className,
      children,
      isActive = false,
      variant = 'default',
      badge = false,
      badgeColor = 'white',
      style,
      ...props
    },
    ref
  ) => {
    const effectiveVariant = isActive ? 'active' : variant;
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'p-2 rounded-md transition-all duration-200 relative touch-manipulation',
          effectiveVariant === 'active'
            ? 'hover:bg-black/10'
            : effectiveVariant === 'highlight'
              ? 'text-white hover:bg-white/30'
              : 'text-white hover:bg-white/20',
          className
        )}
        style={{
          color: effectiveVariant === 'active' ? ACTIVE_TEXT_COLOR : undefined,
          backgroundColor:
            effectiveVariant === 'active'
              ? 'rgba(255, 255, 255, 0.9)'
              : effectiveVariant === 'highlight'
                ? 'rgba(59, 130, 246, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
          border:
            effectiveVariant === 'active'
              ? '1px solid rgba(255, 255, 255, 0.5)'
              : effectiveVariant === 'highlight'
                ? '1px solid rgba(59, 130, 246, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: effectiveVariant === 'active' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
          ...style,
        }}
        {...props}
      >
        {children}
        {badge && (
          <div
            className={cn(
              'absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white',
              badgeColor === 'primary' ? 'bg-primary' : ''
            )}
            style={badgeColor !== 'primary' ? { backgroundColor: badgeColor } : {}}
          />
        )}
      </button>
    );
  }
);

HeaderIconButton.displayName = 'HeaderIconButton';

export { HeaderIconButton };
