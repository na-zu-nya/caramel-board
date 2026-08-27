import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SimilarResultsHeaderProps {
  label: string;
  refreshLabel: string;
  isRefreshing?: boolean;
  onRefresh: () => void;
}

export function SimilarResultsHeader({
  label,
  refreshLabel,
  isRefreshing = false,
  onRefresh,
}: SimilarResultsHeaderProps) {
  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <div className="min-w-0 truncate text-sm text-gray-600">{label}</div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2.5 text-gray-600 hover:text-gray-900"
        disabled={isRefreshing}
        onClick={onRefresh}
      >
        <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} aria-hidden="true" />
        <span>{refreshLabel}</span>
      </Button>
    </div>
  );
}
