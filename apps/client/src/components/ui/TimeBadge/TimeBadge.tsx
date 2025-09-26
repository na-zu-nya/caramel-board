import { cn } from '@/lib/utils';

interface TimeBadgeProps {
  seconds?: number;
  text?: string;
  className?: string;
}

function formatMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function TimeBadge({ seconds, text, className }: TimeBadgeProps) {
  const content = text ?? (seconds != null ? formatMMSS(seconds) : '00:00');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 bg-black/40 text-white text-xs font-medium tabular-nums select-none',
        className
      )}
    >
      {content}
    </span>
  );
}

