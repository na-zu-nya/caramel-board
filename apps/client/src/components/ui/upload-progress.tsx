import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { uploadNotificationsAtom, uploadProgressAtom } from '@/stores/upload';
import { useAtomValue } from 'jotai';
import { AlertCircle, CheckCircle } from 'lucide-react';

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
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[120]">
          <div className="bg-white rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                アップロード中 ({progress.completed}/{progress.total})
              </span>
              {progress.errors > 0 && (
                <span className="text-sm text-red-500">{progress.errors}件のエラー</span>
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
      <div className="fixed top-4 right-4 z-[120] space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg animate-slide-in-right',
              {
                'bg-green-50 text-green-800 border border-green-200':
                  notification.type === 'success',
                'bg-red-50 text-red-800 border border-red-200': notification.type === 'error',
                'bg-primary/10 text-primary border border-primary/20': notification.type === 'info',
              }
            )}
          >
            {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {notification.type === 'info' && <AlertCircle className="w-5 h-5" />}

            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
