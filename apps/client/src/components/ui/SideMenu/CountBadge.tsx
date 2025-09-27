import { cn } from '@/lib/utils';

export function CountBadge({ count, className }: { count?: number; className?: string }) {
  if (!count && typeof count !== 'number') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded bg-gray-100 text-gray-600 text-[11px] px-1.5 py-0.5 min-w-[1.5rem]',
        className
      )}
    >
      {count.toLocaleString()}
    </span>
  );
}
