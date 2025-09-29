import { apiClient } from '@/lib/api-client';

export type FolderGroup = {
  id: string;
  name: string;
  files: File[];
};

export type FolderUploadMode = 'single-stack' | 'create-collection' | 'flat-upload';

export interface FolderUploadDefaults {
  datasetId: number;
  mediaType?: string;
  tags?: string[];
  author?: string;
  collectionId?: number;
}

const ROOT_KEY = '__root__';

function generateGroupId(name: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${name}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractTopLevelFolder(file: File): string | null {
  const anyFile = file as File & { webkitRelativePath?: string; __dropZoneRelativePath?: string };
  const relativePath = anyFile.webkitRelativePath || anyFile.__dropZoneRelativePath || '';
  if (!relativePath) return null;
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length <= 1) return null;
  return segments[0];
}

export function splitFilesByTopLevelFolder(files: File[]): {
  folders: FolderGroup[];
  standalone: File[];
} {
  const folderBuckets = new Map<string, File[]>();
  const standalone: File[] = [];

  files.forEach((file) => {
    const topLevel = extractTopLevelFolder(file);
    if (!topLevel) {
      standalone.push(file);
      return;
    }

    const bucketKey = topLevel || ROOT_KEY;
    const bucket = folderBuckets.get(bucketKey);
    if (bucket) {
      bucket.push(file);
    } else {
      folderBuckets.set(bucketKey, [file]);
    }
  });

  const folders: FolderGroup[] = Array.from(folderBuckets.entries()).map(([name, bucket]) => ({
    id: generateGroupId(name === ROOT_KEY ? 'root' : name),
    name: name === ROOT_KEY ? 'root' : name,
    files: bucket,
  }));

  return {
    folders,
    standalone,
  };
}

export function sortFilesByRelativePath(files: File[]): File[] {
  return [...files].sort((a, b) => {
    const aPath = ((a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name).toLowerCase();
    const bPath = ((b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name).toLowerCase();
    if (aPath < bPath) return -1;
    if (aPath > bPath) return 1;
    return 0;
  });
}

export async function uploadFolderAsSingleStack(
  files: File[],
  defaults: FolderUploadDefaults
): Promise<{ stackId: number; assetIds: number[] }> {
  const sortedFiles = sortFilesByRelativePath(files);
  const [primary, ...rest] = sortedFiles;

  if (!primary) {
    throw new Error('フォルダにファイルが含まれていません。');
  }

  const stack = await apiClient.createStackWithFile(primary, {
    name: primary.name,
    datasetId: String(defaults.datasetId),
    mediaType: defaults.collectionId ? 'image' : defaults.mediaType,
    tags: defaults.tags,
    author: defaults.author,
  });

  const createdStackId = Number(stack.id);
  const assetIds: number[] = [];

  if (defaults.collectionId) {
    try {
      await apiClient.addStackToCollection(defaults.collectionId, createdStackId);
    } catch (error) {
      console.warn('Failed to add stack to collection after single-stack import', error);
    }
  }

  const sequential = async () => {
    for (const file of rest) {
      const asset = await apiClient.addAssetToStack(createdStackId, file);
      assetIds.push(Number(asset.id));
    }
  };

  await sequential();

  return { stackId: createdStackId, assetIds };
}

export async function uploadFolderAsCollection(
  files: File[],
  defaults: FolderUploadDefaults,
  collectionName: string
): Promise<{ collectionId: number; stackIds: number[] }> {
  if (!collectionName.trim()) {
    throw new Error('コレクション名を入力してください');
  }

  const sortedFiles = sortFilesByRelativePath(files);
  if (sortedFiles.length === 0) {
    throw new Error('フォルダにファイルが含まれていません。');
  }

  const concurrentLimit = 3;
  const stackIds: number[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < sortedFiles.length; i += concurrentLimit) {
    const chunk = sortedFiles.slice(i, i + concurrentLimit);
    await Promise.all(
      chunk.map(async (file) => {
        try {
          const stack = await apiClient.createStackWithFile(file, {
            name: file.name,
            datasetId: String(defaults.datasetId),
            mediaType: defaults.mediaType,
            tags: defaults.tags,
            author: defaults.author,
          });
          stackIds.push(Number(stack.id));
        } catch (error) {
          console.error('Failed to create stack from file', file.name, error);
          if (error instanceof Error) {
            errors.push(error);
          } else {
            errors.push(new Error('スタックの作成に失敗しました'));
          }
        }
      })
    );
  }

  if (stackIds.length === 0) {
    throw errors[0] || new Error('スタックを作成できませんでした');
  }

  const newCollection = await apiClient.createCollection({
    name: collectionName.trim(),
    type: 'MANUAL',
    dataSetId: defaults.datasetId,
    icon: 'Folder',
  });

  await apiClient.bulkAddStacksToCollection(newCollection.id, stackIds);

  return { collectionId: Number(newCollection.id), stackIds };
}
