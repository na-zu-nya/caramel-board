import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

interface StackPageIndicatorProps {
  currentPage: number;
  totalPages: number;
  isGesturing: boolean;
  className?: string;
}

export default function StackPageIndicator({
  currentPage,
  totalPages,
  isGesturing,
  className,
}: StackPageIndicatorProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (totalPages <= 1) return;
    // Avoid showing on initial mount
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
    } else {
      setVisible(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setVisible(false), 1000); // show 1s
    }
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div
      className={cn(
        'pointer-events-none select-none absolute top-6 left-1/2 -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-white text-sm transition-opacity duration-300',
        visible && !isGesturing ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {currentPage + 1} / {totalPages}
    </div>
  );
}
