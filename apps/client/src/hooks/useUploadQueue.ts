import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { UploadService } from '@/lib/upload-service';
import {
  addUploadNotificationAtom,
  completeBatchAtom,
  currentBatchAtom,
  processNextBatchAtom,
  updateFileProgressAtom,
  uploadQueueAtom,
} from '@/stores/upload';

export function useUploadQueue() {
  const currentBatch = useAtomValue(currentBatchAtom);
  const uploadQueue = useAtomValue(uploadQueueAtom);
  const processNextBatch = useSetAtom(processNextBatchAtom);
  const updateFileProgress = useSetAtom(updateFileProgressAtom);
  const completeBatch = useSetAtom(completeBatchAtom);
  const addNotification = useSetAtom(addUploadNotificationAtom);

  const uploadServiceRef = useRef(new UploadService());
  const processingRef = useRef(false);

  // Auto-process the upload queue
  useEffect(() => {
    if (!currentBatch && uploadQueue.length > 0) {
      processNextBatch();
    }
  }, [currentBatch, uploadQueue.length, processNextBatch]);

  // Auto-process current batch
  useEffect(() => {
    if (currentBatch && !processingRef.current) {
      processingRef.current = true;

      const processBatch = async () => {
        try {
          await uploadServiceRef.current.processUploadBatch(
            currentBatch,
            (fileId, progress, status, error) => {
              updateFileProgress({ fileId, progress, status, error });
            },
            addNotification
          );
        } finally {
          processingRef.current = false;
          completeBatch();
        }
      };

      processBatch();
    }

    // Reset processing flag when no current batch
    if (!currentBatch) {
      processingRef.current = false;
    }
  }, [currentBatch, updateFileProgress, addNotification, completeBatch]);

  return {
    isUploading: !!currentBatch,
    queueLength: uploadQueue.length,
    currentBatch,
  };
}
