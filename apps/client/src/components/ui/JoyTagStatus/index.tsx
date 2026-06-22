import { useT } from '@/lib/i18n';
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
  const t = useT();
  const label = status === 'running' ? t.autoTagPage.running : t.autoTagPage.notAvailable;
  const statusClass = status === 'running' ? 'text-green-600' : 'text-red-500';

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="font-medium text-muted-foreground">{t.autoTagPage.joyTagServer}</span>
      {isLoading ? (
        <span className="text-muted-foreground animate-pulse">{t.autoTagPage.checking}</span>
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
