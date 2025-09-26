import { atom } from 'jotai';

export interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  stackId?: number; // For adding to existing stack
  result?: {
    stackId: number;
    assetId: number;
  };
}

export interface UploadBatch {
  id: string;
  files: UploadFile[];
  type: 'new-stack' | 'add-to-stack';
  stackId?: number; // For add-to-stack type
  metadata?: {
    datasetId?: number;
    mediaType?: string;
    tags?: string[];
    author?: string;
    collectionId?: number;
  };
}

// Upload queue with all files
export const uploadQueueAtom = atom<UploadFile[]>([]);

// Currently uploading batch (max 10 files)
export const currentBatchAtom = atom<UploadBatch | null>(null);

// Upload progress for UI display
export const uploadProgressAtom = atom((get) => {
  const queue = get(uploadQueueAtom);
  const currentBatch = get(currentBatchAtom);

  if (queue.length === 0 && !currentBatch) {
    return null;
  }

  const allFiles = [...queue, ...(currentBatch?.files || [])];

  const completed = allFiles.filter((f) => f.status === 'completed').length;
  const errors = allFiles.filter((f) => f.status === 'error').length;
  const total = allFiles.length;

  const uploadingFiles = allFiles.filter((f) => f.status === 'uploading');
  const totalProgress = uploadingFiles.reduce((sum, f) => sum + f.progress, 0);
  const averageProgress = uploadingFiles.length > 0 ? totalProgress / uploadingFiles.length : 0;

  return {
    completed,
    errors,
    total,
    progress: total > 0 ? ((completed + averageProgress / 100) / total) * 100 : 0,
    isUploading: uploadingFiles.length > 0,
  };
});

// Default upload metadata (set from current filters)
export const uploadDefaultsAtom = atom<{
  datasetId?: number;
  mediaType?: string;
  tags?: string[];
  author?: string;
  collectionId?: number;
}>({});

// Upload notification messages
export const uploadNotificationsAtom = atom<
  Array<{
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
    timestamp: number;
  }>
>([]);

// Add notification
export const addUploadNotificationAtom = atom(
  null,
  (get, set, notification: { type: 'success' | 'error' | 'info'; message: string }) => {
    const current = get(uploadNotificationsAtom);
    const newNotification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
    set(uploadNotificationsAtom, [...current, newNotification]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      set(uploadNotificationsAtom, (prev) => prev.filter((n) => n.id !== newNotification.id));
    }, 5000);
  }
);

// Add files to upload queue
export const addFilesToQueueAtom = atom(
  null,
  (
    get,
    set,
    {
      files,
      type: _type,
      stackId,
    }: {
      files: File[];
      type: 'new-stack' | 'add-to-stack';
      stackId?: number;
    }
  ) => {
    const newFiles: UploadFile[] = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      progress: 0,
      status: 'pending' as const,
      stackId,
    }));

    set(uploadQueueAtom, [...get(uploadQueueAtom), ...newFiles]);
  }
);

// Process next batch from queue
export const processNextBatchAtom = atom(null, (get, set) => {
  const queue = get(uploadQueueAtom);
  const currentBatch = get(currentBatchAtom);

  if (currentBatch || queue.length === 0) {
    return;
  }

  // Take up to 10 files from queue
  const batchFiles = queue.slice(0, 10);
  const remainingQueue = queue.slice(10);

  // Group by upload type
  const newStackFiles = batchFiles.filter((f) => !f.stackId);
  const addToStackFiles = batchFiles.filter((f) => f.stackId);

  // Process new stack files first
  if (newStackFiles.length > 0) {
    const batch: UploadBatch = {
      id: Math.random().toString(36).substr(2, 9),
      files: newStackFiles,
      type: 'new-stack',
      metadata: get(uploadDefaultsAtom),
    };

    set(currentBatchAtom, batch);
    set(uploadQueueAtom, [...addToStackFiles, ...remainingQueue]);
  } else if (addToStackFiles.length > 0) {
    // Group by stackId
    const stackId = addToStackFiles[0].stackId!;
    const sameStackFiles = addToStackFiles.filter((f) => f.stackId === stackId);
    const otherFiles = addToStackFiles.filter((f) => f.stackId !== stackId);

    const batch: UploadBatch = {
      id: Math.random().toString(36).substr(2, 9),
      files: sameStackFiles,
      type: 'add-to-stack',
      stackId,
    };

    set(currentBatchAtom, batch);
    set(uploadQueueAtom, [...otherFiles, ...remainingQueue]);
  }
});

// Update file progress
export const updateFileProgressAtom = atom(
  null,
  (
    get,
    set,
    {
      fileId,
      progress,
      status,
      error,
    }: {
      fileId: string;
      progress?: number;
      status?: UploadFile['status'];
      error?: string;
    }
  ) => {
    const currentBatch = get(currentBatchAtom);
    if (!currentBatch) return;

    const updatedFiles = currentBatch.files.map((f) =>
      f.id === fileId
        ? { ...f, progress: progress ?? f.progress, status: status ?? f.status, error }
        : f
    );

    set(currentBatchAtom, { ...currentBatch, files: updatedFiles });
  }
);

// Complete current batch
export const completeBatchAtom = atom(null, (get, set) => {
  const currentBatch = get(currentBatchAtom);
  if (!currentBatch) return;

  const successCount = currentBatch.files.filter((f) => f.status === 'completed').length;
  const errorCount = currentBatch.files.filter((f) => f.status === 'error').length;
  const totalInBatch = currentBatch.files.length;

  if (successCount > 0) {
    set(addUploadNotificationAtom, {
      type: 'success',
      message: `${successCount}件のファイルをアップロードしました`,
    });
  }

  // 単一ファイルバッチでは個別トーストが既に表示されるため、重複通知を抑制
  if (errorCount > 0 && totalInBatch > 1) {
    set(addUploadNotificationAtom, {
      type: 'error',
      message: `${errorCount}件のファイルのアップロードに失敗しました`,
    });
  }

  set(currentBatchAtom, null);

  // Process next batch
  set(processNextBatchAtom);
});

// Clear all completed uploads
export const clearCompletedUploadsAtom = atom(null, (get, set) => {
  const queue = get(uploadQueueAtom);
  set(
    uploadQueueAtom,
    queue.filter((f) => f.status !== 'completed')
  );
});
