import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { uploadFolderAsCollection } from '@/lib/folder-import';
import { UploadService } from '@/lib/upload-service';
import type { UploadBatch, UploadFile } from '@/stores/upload';
import type { Collection, Stack } from '@/types';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFile(name: string) {
  return new File(['test'], name, { type: 'image/png' });
}

function createStack(id: number, fileName: string): Stack {
  return {
    id,
    datasetId: '1',
    name: fileName,
    mediaType: 'image',
    assetCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [
      {
        id: id * 10,
        stackId: id,
        file: `/files/${fileName}`,
      },
    ],
  };
}

function createCollection(id: number): Collection {
  return {
    id,
    name: 'collection',
    icon: 'Folder',
    type: 'MANUAL',
    dataSetId: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createUploadFile(id: string, file: File): UploadFile {
  return {
    id,
    file,
    progress: 0,
    status: 'pending',
    metadata: { datasetId: 1, mediaType: 'image' },
  };
}

describe('upload ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends new stack uploads sequentially in the selected order', async () => {
    const first = createDeferred<Stack>();
    const second = createDeferred<Stack>();
    const createStackWithFile = vi
      .spyOn(apiClient, 'createStackWithFile')
      .mockImplementation((file) => {
        if (file.name === '01.png') return first.promise;
        if (file.name === '02.png') return second.promise;
        throw new Error(`Unexpected file: ${file.name}`);
      });

    const batch: UploadBatch = {
      id: 'batch',
      type: 'new-stack',
      files: [
        createUploadFile('first', createFile('01.png')),
        createUploadFile('second', createFile('02.png')),
      ],
      metadata: { datasetId: 1, mediaType: 'image' },
    };
    const service = new UploadService();
    const uploadPromise = service.processUploadBatch(batch, vi.fn(), vi.fn());

    await vi.waitFor(() => expect(createStackWithFile).toHaveBeenCalledTimes(1));
    expect(createStackWithFile.mock.calls[0]?.[0].name).toBe('01.png');

    first.resolve(createStack(1, '01.png'));
    await vi.waitFor(() => expect(createStackWithFile).toHaveBeenCalledTimes(2));
    expect(createStackWithFile.mock.calls[1]?.[0].name).toBe('02.png');

    second.resolve(createStack(2, '02.png'));
    await uploadPromise;
  });

  it('adds folder collection stacks in sorted file order even when uploads complete out of order', async () => {
    const deferredByName = new Map<string, ReturnType<typeof createDeferred<Stack>>>();
    for (const name of ['01.png', '02.png', '03.png']) {
      deferredByName.set(name, createDeferred<Stack>());
    }

    const createStackWithFile = vi
      .spyOn(apiClient, 'createStackWithFile')
      .mockImplementation((file) => {
        const deferred = deferredByName.get(file.name);
        if (!deferred) throw new Error(`Unexpected file: ${file.name}`);
        return deferred.promise;
      });
    vi.spyOn(apiClient, 'createCollection').mockResolvedValue(createCollection(50));
    const bulkAddStacksToCollection = vi
      .spyOn(apiClient, 'bulkAddStacksToCollection')
      .mockResolvedValue(undefined);

    const uploadPromise = uploadFolderAsCollection(
      [createFile('03.png'), createFile('01.png'), createFile('02.png')],
      { datasetId: 1, mediaType: 'image' },
      'collection'
    );

    await vi.waitFor(() => expect(createStackWithFile).toHaveBeenCalledTimes(3));
    expect(createStackWithFile.mock.calls.map(([file]) => file.name)).toEqual([
      '01.png',
      '02.png',
      '03.png',
    ]);

    deferredByName.get('03.png')?.resolve(createStack(3, '03.png'));
    deferredByName.get('01.png')?.resolve(createStack(1, '01.png'));
    deferredByName.get('02.png')?.resolve(createStack(2, '02.png'));

    await uploadPromise;

    expect(bulkAddStacksToCollection).toHaveBeenCalledWith(50, [1, 2, 3]);
  });
});
