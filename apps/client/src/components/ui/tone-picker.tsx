import { cn } from '@/lib/utils';
import * as React from 'react';

interface TonePickerProps {
  value?: { saturation: number; lightness: number };
  onChange?: (value: { saturation: number; lightness: number }) => void;
  tolerance?: number;
  onToleranceChange?: (tolerance: number) => void;
  disabled?: boolean;
  className?: string;
}

export function TonePicker({
  value = { saturation: 50, lightness: 50 },
  onChange,
  tolerance = 50,
  onToleranceChange,
  disabled = false,
  className,
}: TonePickerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault(); // テキスト選択を防ぐ
    setIsDragging(true);
    updatePosition(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || disabled) return;
    e.preventDefault(); // テキスト選択を防ぐ
    updatePosition(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updatePosition = (e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current || disabled) return;

    const rect = containerRef.current.getBoundingClientRect();
    // 枠外でもクランプして継続
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 0-100の範囲にクランプ
    const clampedX = Math.max(0, Math.min(rect.width, x));
    const clampedY = Math.max(0, Math.min(rect.height, y));

    const saturation = Math.round((clampedX / rect.width) * 100);
    const lightness = Math.round((1 - clampedY / rect.height) * 100);

    onChange?.({ saturation, lightness });
  };

  React.useEffect(() => {
    if (isDragging) {
      // ドラッグ中はbodyのカーソルも変更
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging]);

  // Calculate position from value
  const dotX = (value.saturation / 100) * 100;
  const dotY = (1 - value.lightness / 100) * 100;

  // Calculate tolerance circle size
  // 100%の場合は表示しない、それ以外は比例して大きくする
  const toleranceSize = tolerance >= 100 ? 0 : (tolerance / 100) * 300; // Scale tolerance to pixels

  return (
    <div className={cn('space-y-4', className)}>
      {/* Tone Picker Box */}
      <div className="relative">
        <div
          ref={containerRef}
          className={cn(
            'relative w-full h-48 rounded-lg border-2 border-gray-300 cursor-crosshair overflow-hidden select-none',
            disabled && 'opacity-50 cursor-not-allowed',
            isDragging && 'cursor-grabbing'
          )}
          onMouseDown={handleMouseDown}
          style={{
            background: `
              linear-gradient(to top, 
                hsl(0, 0%, 0%) 0%,
                hsl(0, 0%, 50%) 50%,
                hsl(0, 0%, 100%) 100%
              ),
              linear-gradient(to right,
                hsla(0, 0%, 50%, 0) 0%,
                hsl(var(--primary)) 100%
              )`,
            backgroundBlendMode: 'multiply',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Grid lines for reference */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute left-1/4 top-0 bottom-0 w-px bg-gray-400" />
            <div className="absolute left-2/4 top-0 bottom-0 w-px bg-gray-400" />
            <div className="absolute left-3/4 top-0 bottom-0 w-px bg-gray-400" />
            <div className="absolute top-1/4 left-0 right-0 h-px bg-gray-400" />
            <div className="absolute top-2/4 left-0 right-0 h-px bg-gray-400" />
            <div className="absolute top-3/4 left-0 right-0 h-px bg-gray-400" />
          </div>

          {/* Labels */}
          <div className="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/50 px-1 rounded select-none pointer-events-none">
            暗い・無彩色
          </div>
          <div className="absolute top-2 right-2 text-xs font-medium text-gray-800 bg-white/50 px-1 rounded select-none pointer-events-none">
            明るい・鮮やか
          </div>

          {/* Tolerance circle */}
          {toleranceSize > 0 && (
            <div
              className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: `${dotX}%`,
                top: `${dotY}%`,
                width: `${toleranceSize}px`,
                height: `${toleranceSize}px`,
              }}
            >
              <div className="w-full h-full rounded-full border-2 border-primary bg-primary/20" />
            </div>
          )}

          {/* Selected point */}
          <div
            className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${dotX}%`,
              top: `${dotY}%`,
            }}
          >
            <div className="w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg" />
          </div>
        </div>

        {/* Axis labels */}
        <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-gray-600">
          彩度 (Saturation) →
        </div>
        <div className="absolute -left-20 top-0 bottom-0 flex items-center">
          <div className="transform -rotate-90 text-xs text-gray-600 whitespace-nowrap">
            明度 (Lightness) →
          </div>
        </div>
      </div>

      {/* Current values display */}
      <div className="flex justify-between text-xs text-gray-600 mt-8">
        <span>彩度: {value.saturation}%</span>
        <span>明度: {value.lightness}%</span>
      </div>

      {/* Tolerance slider */}
      {onToleranceChange && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-gray-700">許容範囲</label>
            <span className="text-xs text-gray-500">{tolerance}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={tolerance}
            onChange={(e) => onToleranceChange(Number(e.target.value))}
            disabled={disabled}
            className={cn(
              'w-full h-2 rounded-lg appearance-none cursor-pointer slider-primary',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{
              background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                ((tolerance - 5) / 95) * 100
              }%, #E5E7EB ${((tolerance - 5) / 95) * 100}%, #E5E7EB 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>狭い</span>
            <span className="text-center">{tolerance >= 100 ? '全画像' : '広い'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
