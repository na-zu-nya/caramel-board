import type { UploadBatch, UploadFile } from '@/stores/upload';
import { apiClient } from './api-client';

export class UploadService {
  private isProcessing = false;

  async processUploadBatch(
    batch: UploadBatch,
    updateProgress: (
      fileId: string,
      progress: number,
      status: UploadFile['status'],
      error?: string
    ) => void,
    addNotification: (notification: { type: 'success' | 'error' | 'info'; message: string }) => void
  ) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      if (batch.type === 'new-stack') {
        await this.processNewStackBatch(batch, updateProgress, addNotification);
      } else if (batch.type === 'add-to-stack') {
        await this.processAddToStackBatch(batch, updateProgress, addNotification);
      }
    } catch (error) {
      // ここに来るのは想定外の例外のみ（個別ファイルはそれぞれで捕捉済み）
      console.error('Batch processing error (unexpected):', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processNewStackBatch(
    batch: UploadBatch,
    updateProgress: (
      fileId: string,
      progress: number,
      status: UploadFile['status'],
      error?: string
    ) => void,
    addNotification: (notification: { type: 'success' | 'error' | 'info'; message: string }) => void
  ) {
    // Process files in parallel (up to 3 at a time to avoid overloading)
    const concurrentLimit = 3;
    const chunks = [];

    for (let i = 0; i < batch.files.length; i += concurrentLimit) {
      chunks.push(batch.files.slice(i, i + concurrentLimit));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (file) => {
          try {
            updateProgress(file.id, 0, 'uploading');

            const stack = await apiClient.createStackWithFile(file.file, {
              name: file.file.name,
              datasetId: batch.metadata?.datasetId?.toString(),
              mediaType: batch.metadata?.collectionId ? 'image' : batch.metadata?.mediaType,
              tags: batch.metadata?.tags,
              author: batch.metadata?.author,
              onProgress: (progress) => {
                updateProgress(file.id, progress, 'uploading');
              },
            });

            // If a collectionId is provided, add the new stack to that collection
            if (batch.metadata?.collectionId && stack?.id) {
              try {
                await apiClient.addStackToCollection(batch.metadata.collectionId, Number(stack.id));
              } catch (e) {
                console.warn('Failed to add stack to collection after upload', e);
              }
            }

            updateProgress(file.id, 100, 'completed');
            file.result = {
              stackId: Number(stack.id),
              assetId: Number(stack.assets?.[0]?.id) || 0,
            };
          } catch (error) {
            console.error(`Upload failed for ${file.file.name}:`, error);
            const msg = error instanceof Error ? error.message : 'アップロードに失敗しました';
            updateProgress(file.id, 0, 'error', msg);
            // 表示: 重複などの理由をトーストに出す
            addNotification({ type: 'error', message: `${file.file.name}: ${msg}` });
          }
        })
      );
    }
  }

  private async processAddToStackBatch(
    batch: UploadBatch,
    updateProgress: (
      fileId: string,
      progress: number,
      status: UploadFile['status'],
      error?: string
    ) => void,
    addNotification: (notification: { type: 'success' | 'error' | 'info'; message: string }) => void
  ) {
    if (!batch.stackId) return;

    // Process files sequentially for adding to stack
    for (const file of batch.files) {
      try {
        updateProgress(file.id, 0, 'uploading');

        const asset = await apiClient.addAssetToStack(batch.stackId, file.file, {
          onProgress: (progress) => {
            updateProgress(file.id, progress, 'uploading');
          },
        });

        updateProgress(file.id, 100, 'completed');
        file.result = {
          stackId: Number(batch.stackId),
          assetId: Number(asset.id),
        };
      } catch (error) {
        console.error(`Upload failed for ${file.file.name}:`, error);
        const msg = error instanceof Error ? error.message : 'アップロードに失敗しました';
        updateProgress(file.id, 0, 'error', msg);
        addNotification({ type: 'error', message: `${file.file.name}: ${msg}` });
      }
    }
  }
}
