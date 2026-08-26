import { useAtomValue, useSetAtom } from 'jotai';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  removeUploadNotificationAtom,
  uploadNotificationsAtom,
  uploadProgressAtom,
} from '@/stores/upload';

type UploadNotification = {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  timestamp: number;
};

const SWIPE_DISMISS_THRESHOLD = 64;
const DRAG_THRESHOLD = 4;

function TickerItem({
  notification,
  onDismiss,
}: {
  notification: UploadNotification;
  onDismiss: (id: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const movedRef = useRef(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    startXRef.current = event.clientX;
    movedRef.current = false;
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = event.clientX - startXRef.current;
    if (Math.abs(delta) > DRAG_THRESHOLD) {
      movedRef.current = true;
    }
    setDx(delta);
  };

  const endDrag = () => {
    setDragging(false);
    if (Math.abs(dx) > SWIPE_DISMISS_THRESHOLD) {
      onDismiss(notification.id);
      return;
    }
    setDx(0);
  };

  const handleClick = () => {
    if (movedRef.current) return;
    onDismiss(notification.id);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleClick}
      style={{
        transform: `translateX(${dx}px)`,
        opacity: Math.max(0, 1 - Math.abs(dx) / 160),
        transition: dragging ? 'none' : 'transform 150ms ease-out, opacity 150ms ease-out',
        touchAction: 'pan-y',
      }}
      className={cn(
        'pointer-events-auto flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 shadow-lg animate-slide-in-right lg:px-4 lg:py-3',
        {
          'bg-green-50 text-green-800 border border-green-200': notification.type === 'success',
          'bg-red-50 text-red-800 border border-red-200': notification.type === 'error',
          'bg-amber-50 text-amber-800 border border-amber-200': notification.type === 'info',
        }
      )}
    >
      {notification.type === 'success' && (
        <CheckCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />
      )}
      {notification.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />}
      {notification.type === 'info' && <AlertCircle className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />}

      <span className="min-w-0 text-xs font-medium leading-snug lg:text-sm">
        {notification.message}
      </span>
    </div>
  );
}

export function UploadProgress() {
  const progress = useAtomValue(uploadProgressAtom);
  const notifications = useAtomValue(uploadNotificationsAtom);
  const removeNotification = useSetAtom(removeUploadNotificationAtom);

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
              {progress.isUploading ? (
                <span className="animate-pulse">アップロード中...</span>
              ) : progress.pending > 0 ? (
                <span>待機中...</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Notification Ticker */}
      <div className="pointer-events-none fixed left-3 right-3 top-[calc(3.5rem+env(safe-area-inset-top)+0.75rem)] z-[120] space-y-2 sm:left-auto sm:right-4 sm:w-80 lg:w-96">
        {notifications.map((notification) => (
          <TickerItem
            key={notification.id}
            notification={notification}
            onDismiss={removeNotification}
          />
        ))}
      </div>
    </>
  );
}
