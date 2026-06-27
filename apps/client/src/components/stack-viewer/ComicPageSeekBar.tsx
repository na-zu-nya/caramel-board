import { Bookmark } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import SeekTrack, { type SeekTrackMarker } from '@/components/ui/SeekBar/SeekTrack';
import TimeBadge from '@/components/ui/TimeBadge/TimeBadge';
import { cn } from '@/lib/utils';

interface ComicPageSeekBarProps {
  currentIndex: number;
  total: number;
  openingDirection: 'right-opening' | 'left-opening';
  bookmarkIndexes?: number[];
  visible: boolean;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onSeek: (index: number) => void;
}

const clampIndex = (value: number, total: number) =>
  Math.min(Math.max(Math.round(value), 0), Math.max(0, total - 1));

export default function ComicPageSeekBar({
  currentIndex,
  total,
  openingDirection,
  bookmarkIndexes = [],
  visible,
  onHoverStart,
  onHoverEnd,
  onSeek,
}: ComicPageSeekBarProps) {
  const isRightOpening = openingDirection === 'right-opening';
  const denominator = Math.max(1, total - 1);
  const visualValue = isRightOpening ? denominator - currentIndex : currentIndex;
  const pageCountText = `${currentIndex + 1} / ${total}`;
  const bookmarkMarkers = useMemo<Array<SeekTrackMarker<number>>>(
    () =>
      bookmarkIndexes.map((index) => ({
        key: index,
        value: isRightOpening ? denominator - index : index,
        data: index,
      })),
    [bookmarkIndexes, denominator, isRightOpening]
  );

  const handleSeek = useCallback(
    (nextVisualValue: number) => {
      const readingValue = isRightOpening ? denominator - nextVisualValue : nextVisualValue;
      onSeek(clampIndex(readingValue, total));
    },
    [denominator, isRightOpening, onSeek, total]
  );

  if (total <= 1) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[95]">
      <div className="px-4 py-2">
        <div className="flex items-center gap-3">
          <TimeBadge text={pageCountText} className="shrink-0" />
          <div
            className={cn(
              'min-w-0 flex-1 transition-opacity duration-150',
              visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            )}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') onHoverStart?.();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') onHoverEnd?.();
            }}
          >
            <SeekTrack
              value={visualValue}
              max={denominator}
              step={1}
              markers={bookmarkMarkers}
              className="flex-1"
              markerLayerClassName="top-2.5"
              rangeOrigin={isRightOpening ? 'end' : 'start'}
              nudgePx={0}
              seekOnPointerDown
              onSeek={handleSeek}
              renderMarker={({ iconTop }) => (
                <div
                  className="pointer-events-none absolute -translate-x-1/2 rounded-sm text-primary drop-shadow-[0_0_6px_rgba(255,255,255,0.45)]"
                  style={{ top: iconTop }}
                >
                  <Bookmark className="h-3 w-3 fill-current" />
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
