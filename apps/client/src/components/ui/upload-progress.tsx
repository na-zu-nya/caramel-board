import { useAtomValue } from 'jotai';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { uploadNotificationsAtom, uploadProgressAtom } from '@/stores/upload';

export function UploadProgress() {
  const progress = useAtomValue(uploadProgressAtom);
  const notifications = useAtomValue(uploadNotificationsAtom);

  if (!progress && notifications.length === 0) {
    return null;
  }

  return (
    <>
      {/* Upload Progress Indicator */}
      {progress && (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[120] flex justify-center sm:inset-x-auto sm:left-1/2 sm:w-80 sm:-translate-x-1/2 lg:bottom-4 lg:w-[400px]">
          <div className="w-full rounded-lg bg-white p-3 shadow-lg lg:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium leading-snug lg:text-sm">
                アップロード中 ({progress.completed}/{progress.total})
              </span>
              {progress.errors > 0 && (
                <span className="shrink-0 text-xs text-red-500 lg:text-sm">
                  {progress.errors}件のエラー
                </span>
              )}
            </div>

            <Progress value={progress.progress} className="mb-2" />

            <div className="flex justify-between text-xs text-gray-500">
              <span>進行状況: {Math.round(progress.progress)}%</span>
              {progress.isUploading && <span className="animate-pulse">アップロード中...</span>}
            </div>
          </div>
        </div>
      )}

      {/* Notification Ticker */}
      <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[120] space-y-2 sm:left-auto sm:right-4 sm:w-80 lg:top-4 lg:w-96">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              'flex items-start gap-2 rounded-lg px-3 py-2.5 shadow-lg animate-slide-in-right lg:px-4 lg:py-3',
              {
                'bg-green-50 text-green-800 border border-green-200':
                  notification.type === 'success',
                'bg-red-50 text-red-800 border border-red-200': notification.type === 'error',
                'bg-amber-50 text-amber-800 border border-amber-200': notification.type === 'info',
              }
            )}
          >
            {notification.type === 'success' && (
              <CheckCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
            )}
            {notification.type === 'error' && (
              <AlertCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
            )}
            {notification.type === 'info' && (
              <AlertCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
            )}

            <span className="min-w-0 text-xs font-medium leading-snug lg:text-sm">
              {notification.message}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
