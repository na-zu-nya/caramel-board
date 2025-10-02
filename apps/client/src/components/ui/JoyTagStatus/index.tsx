import { cn } from '@/lib/utils';

export interface JoyTagStatusProps {
  status: 'running' | 'not-available';
  isLoading?: boolean;
  message?: string;
  className?: string;
}

export const JoyTagStatus = ({
  status,
  isLoading = false,
  message,
  className,
}: JoyTagStatusProps) => {
  const label = status === 'running' ? 'Running' : 'Not Available';
  const statusClass = status === 'running' ? 'text-green-600' : 'text-red-500';

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="font-medium text-muted-foreground">JoyTag Server:</span>
      {isLoading ? (
        <span className="text-muted-foreground animate-pulse">Checking...</span>
      ) : (
        <span className={statusClass}>{label}</span>
      )}
      {message && !isLoading ? (
        <span className="text-xs text-muted-foreground line-clamp-1" title={message}>
          ({message})
        </span>
      ) : null}
    </div>
  );
};
