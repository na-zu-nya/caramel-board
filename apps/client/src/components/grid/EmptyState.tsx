import { Loader2 } from 'lucide-react';

interface EmptyStateProps {
  isLoading: boolean;
  error: Error | null;
  itemsLength: number;
  emptyState?: {
    icon: string;
    title: string;
    description: string;
  };
}

export function EmptyState({ isLoading, error, itemsLength, emptyState }: EmptyStateProps) {
  if (isLoading && itemsLength === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && itemsLength === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load items</p>
          <p className="text-gray-400 text-sm">Please try again later</p>
        </div>
      </div>
    );
  }

  if (itemsLength === 0 && emptyState && !isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl mb-4 block">{emptyState.icon}</span>
          <p className="text-gray-300 mb-2">{emptyState.title}</p>
          <p className="text-sm text-gray-400">{emptyState.description}</p>
        </div>
      </div>
    );
  }

  return null;
}
