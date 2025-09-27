import { useSetAtom } from 'jotai';
import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyText } from '@/lib/clipboard';
import { cn, hexForCopy } from '@/lib/utils';
import { addUploadNotificationAtom } from '@/stores/upload';
import type { DominantColor } from '@/types';

interface ColorBallProps {
  color: DominantColor;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  onClick?: (color: DominantColor) => void;
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function ColorBall({
  color,
  size = 'md',
  showTooltip = true,
  onClick,
  className,
}: ColorBallProps) {
  const addNotification = useSetAtom(addUploadNotificationAtom);
  const [hovered, setHovered] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    const wantCopy = !onClick || e.metaKey || e.ctrlKey || e.altKey;
    if (wantCopy) {
      const copied = hexForCopy(color.hex);
      copyText(copied).then((ok) =>
        addNotification({
          type: ok ? 'success' : 'error',
          message: ok ? `Copied ${copied} to clipboard` : 'Failed to copy to clipboard',
        })
      );
      return;
    }
    onClick?.(color);
  };

  // Track anchor rect while hovered (for portal tooltip positioning)
  useEffect(() => {
    if (!hovered || !btnRef.current) return;
    const update = () => setAnchorRect(btnRef.current!.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(btnRef.current);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [hovered]);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform cursor-pointer ring-offset-2 hover:ring-2 hover:ring-gray-300',
          sizeClasses[size],
          className
        )}
        style={{ backgroundColor: color.hex }}
        aria-label={showTooltip ? `${color.hex}` : undefined}
      />

      {/* Portal Tooltip */}
      {showTooltip && hovered && anchorRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              style={{
                position: 'fixed',
                left: anchorRect.left + anchorRect.width / 2,
                top: anchorRect.top - 8,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
                pointerEvents: 'none',
              }}
            >
              <div className="px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <Copy size={10} />
                  <span>{color.hex}</span>
                </div>
                <div className="text-gray-300">
                  RGB({color.r}, {color.g}, {color.b})
                </div>
                <div className="text-gray-300">{Math.round(color.percentage * 100)}%</div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translate(-50%, 2px) rotate(45deg)',
                  width: 8,
                  height: 8,
                  background: '#111827', // gray-900
                }}
              />
            </div>,
            document.body
          )
        : null}

      {/* Copy feedback is handled via global toast notifications */}
    </div>
  );
}

interface ColorPaletteProps {
  colors: DominantColor[];
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  onColorClick?: (color: DominantColor) => void;
  className?: string;
}

export function ColorPalette({
  colors,
  size = 'md',
  showTooltip = true,
  onColorClick,
  className,
}: ColorPaletteProps) {
  if (!colors || colors.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-gray-400', className)}>
        <div className={cn('rounded-full bg-gray-200', sizeClasses[size])} />
        <span>No color data</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {colors.map((color, index) => (
        <ColorBall
          key={`${color.hex}-${index}`}
          color={color}
          size={size}
          showTooltip={showTooltip}
          onClick={onColorClick}
        />
      ))}
    </div>
  );
}
