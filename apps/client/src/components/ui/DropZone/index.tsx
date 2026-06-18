import { useEffect, useRef, useState } from 'react';
import { useDrag } from '@/contexts/DragContext';
import { STACK_IDS_MIME } from '@/lib/stack-drag-data';
import { cn } from '@/lib/utils';

interface FileSystemEntryBase {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
}

interface FileSystemFileEntry extends FileSystemEntryBase {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface FileSystemDirectoryReader {
  readEntries: (
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
}

interface FileSystemDirectoryEntry extends FileSystemEntryBase {
  createReader: () => FileSystemDirectoryReader;
}

type FileSystemEntry = FileSystemFileEntry | FileSystemDirectoryEntry;

type UrlDropHandler = (urls: string[], event: DragEvent) => void;

export interface DropZoneFileScanProgress {
  fileCount: number;
  directoryCount: number;
  currentPath?: string;
}

interface DropZoneProps {
  onDrop?: (files: File[]) => void;
  onFilesDrop?: (files: File[]) => void;
  onUrlDrop?: UrlDropHandler;
  scanProgress?: DropZoneFileScanProgress | null;
  accept?: string;
  multiple?: boolean;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  activeClassName?: string;
  disabled?: boolean;
}

const QUALITY_KEYWORDS = [
  'original',
  'orig',
  'master',
  'large',
  'medium',
  'small',
  'thumb',
  'mini',
];
const EXTENSION_PRIORITY = ['.png', '.webp', '.jpeg', '.jpg', '.gif', '.bmp', '.svg'];
const FILENAME_PATTERNS = [
  /_master\d+/gi,
  /_square\d+/gi,
  /_thumb\d+/gi,
  /_small/gi,
  /_medium/gi,
  /_large/gi,
  /_custom\d+/gi,
  /_mini/gi,
];
const QUERY_KEYS_TO_STRIP = new Set([
  'name',
  'mode',
  'size',
  'width',
  'height',
  'w',
  'h',
  's',
  'quality',
  'format',
  'fit',
]);

type CandidateInfo = {
  url: URL;
  canonicalKey: string;
};

function normalizePath(host: string, pathname: string): string {
  let normalized = pathname;

  if (host.endsWith('pximg.net')) {
    normalized = normalized.replace('/img-master/', '/img-original/');
  }

  const segments = normalized.split('/');
  if (segments.length > 0) {
    const lastIndex = segments.length - 1;
    segments[lastIndex] = FILENAME_PATTERNS.reduce(
      (acc, pattern) => acc.replace(pattern, ''),
      segments[lastIndex]
    );
  }

  return segments.join('/');
}

function canonicalizeUrl(raw: string): CandidateInfo | null {
  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase();
    const normalizedPath = normalizePath(host, url.pathname);

    const canonicalParams = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (!QUERY_KEYS_TO_STRIP.has(key.toLowerCase())) {
        canonicalParams.append(key, value);
      }
    });

    const queryString = canonicalParams.toString();
    const canonicalKey = `${host}${normalizedPath}${queryString ? `?${queryString}` : ''}`;

    return { url, canonicalKey };
  } catch (error) {
    console.warn('[DropZone] Failed to parse dropped URL', raw, error);
    return null;
  }
}

function qualityScore(url: URL): number {
  const lower = url.toString().toLowerCase();
  const index = QUALITY_KEYWORDS.findIndex((keyword) => lower.includes(keyword));
  return index === -1 ? QUALITY_KEYWORDS.length : index;
}

function extensionScore(url: URL): number {
  const extMatch = url.pathname.match(/\.[a-z0-9]+$/i);
  if (!extMatch) return EXTENSION_PRIORITY.length;
  const ext = extMatch[0].toLowerCase();
  const index = EXTENSION_PRIORITY.indexOf(ext);
  return index === -1 ? EXTENSION_PRIORITY.length : index;
}

function pickPreferred(existing: URL, candidate: URL): URL {
  const existingQuality = qualityScore(existing);
  const candidateQuality = qualityScore(candidate);
  if (existingQuality !== candidateQuality) {
    return candidateQuality < existingQuality ? candidate : existing;
  }

  const existingExt = extensionScore(existing);
  const candidateExt = extensionScore(candidate);
  if (existingExt !== candidateExt) {
    return candidateExt < existingExt ? candidate : existing;
  }

  const existingHasQuery = existing.search.length > 0;
  const candidateHasQuery = candidate.search.length > 0;
  if (existingHasQuery !== candidateHasQuery) {
    return candidateHasQuery ? existing : candidate;
  }

  if (candidate.pathname.length !== existing.pathname.length) {
    return candidate.pathname.length > existing.pathname.length ? candidate : existing;
  }

  return existing;
}

function splitConcatenatedUrls(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const matches = trimmed.match(/(?:https?|file):\/\/[\s\S]+?(?=(?:https?|file):\/\/|$)/g);
  if (!matches) {
    return [];
  }

  return matches.map((part) => part.trim()).filter((part) => part.length > 0);
}

function extractRawUrlStrings(value: string): string[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const extracted: string[] = [];

  for (const line of lines) {
    const splitUrls = splitConcatenatedUrls(line);
    if (splitUrls.length > 0) {
      extracted.push(...splitUrls);
    }
  }

  return extracted;
}

function extractUrlsFromDataTransfer(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];

  const rawUrls: string[] = [];
  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    rawUrls.push(...extractRawUrlStrings(uriList));
  }

  if (rawUrls.length === 0) {
    const plain = dataTransfer.getData('text/plain')?.trim();
    if (plain) {
      rawUrls.push(...extractRawUrlStrings(plain));
    }

    if (rawUrls.length === 0) {
      const html = dataTransfer.getData('text/html');
      if (html && typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          doc.querySelectorAll('img[src]').forEach((node) => {
            const img = node as HTMLImageElement;
            const href = img.currentSrc || img.src;
            if (href && /^https?:\/\//i.test(href)) {
              rawUrls.push(href);
            }
          });
        } catch (error) {
          console.warn('[DropZone] Failed to parse HTML drag payload', error);
        }
      }
    }
  }

  const bestByKey = new Map<string, URL>();

  rawUrls.forEach((raw) => {
    const candidate = canonicalizeUrl(raw);
    if (!candidate) return;
    const existing = bestByKey.get(candidate.canonicalKey);
    if (existing) {
      bestByKey.set(candidate.canonicalKey, pickPreferred(existing, candidate.url));
    } else {
      bestByKey.set(candidate.canonicalKey, candidate.url);
    }
  });

  return Array.from(bestByKey.values()).map((url) => url.toString());
}

function debugLogDroppedDataTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    console.log('[DropZone] drop payload', { hasDataTransfer: false });
    return;
  }

  const types = Array.from(dataTransfer.types ?? []);
  const items = dataTransfer.items
    ? Array.from(dataTransfer.items).map((item, index) => ({
        index,
        kind: item.kind,
        type: item.type,
      }))
    : [];
  const files = Array.from(dataTransfer.files ?? []).map((file, index) => ({
    index,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  }));

  const dataByType: Record<string, string> = {};
  for (const type of types) {
    try {
      dataByType[type] = dataTransfer.getData(type);
    } catch (error) {
      dataByType[type] =
        `[getData failed: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  console.groupCollapsed('[DropZone] Raw drop payload');
  console.log('types', types);
  console.log('items', items);
  console.log('files', files);
  console.log('dataByType', dataByType);
  console.groupEnd();
}

const RELATIVE_PATH_KEY = '__dropZoneRelativePath';
const FILE_SCAN_NOTIFY_INTERVAL_MS = 120;
const FILE_SCAN_YIELD_EVERY = 80;

interface FileSystemEntryProvider extends DataTransferItem {
  webkitGetAsEntry?: () => FileSystemEntry | null;
}

interface FileScanContext {
  progress: DropZoneFileScanProgress;
  onProgress: (progress: DropZoneFileScanProgress) => void;
  lastNotifyAt: number;
  operationsSinceYield: number;
}

function normalizeRelativePath(fullPath: string): string {
  if (!fullPath) return '';
  const trimmed = fullPath.startsWith('/') ? fullPath.slice(1) : fullPath;
  return trimmed;
}

function getFileSystemEntry(item: DataTransferItem): FileSystemEntry | null {
  const entryProvider = item as FileSystemEntryProvider;
  return entryProvider.webkitGetAsEntry?.() ?? null;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function attachRelativePath(file: File, relativePath: string): File {
  for (const key of ['webkitRelativePath', RELATIVE_PATH_KEY]) {
    try {
      Object.defineProperty(file, key, {
        value: relativePath,
        configurable: true,
      });
    } catch (error: unknown) {
      void error;
    }
  }

  return file;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

async function reportFileScanProgress(context: FileScanContext, force = false): Promise<void> {
  context.operationsSinceYield += 1;
  const now = nowMs();
  const shouldNotify = force || now - context.lastNotifyAt >= FILE_SCAN_NOTIFY_INTERVAL_MS;

  if (shouldNotify) {
    context.lastNotifyAt = now;
    context.onProgress({ ...context.progress });
    context.operationsSinceYield = 0;
    await yieldToBrowser();
    return;
  }

  if (context.operationsSinceYield >= FILE_SCAN_YIELD_EVERY) {
    context.operationsSinceYield = 0;
    await yieldToBrowser();
  }
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    entry.file((file) => {
      const relativePath = normalizeRelativePath(entry.fullPath || entry.name);
      if (relativePath) attachRelativePath(file, relativePath);
      resolve(file);
    }, reject);
  });
}

function readEntryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function readEntriesRecursive(
  reader: FileSystemDirectoryReader,
  context: FileScanContext
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await readEntryBatch(reader);
    if (batch.length === 0) {
      return entries;
    }
    entries.push(...batch);
    await reportFileScanProgress(context);
  }
}

async function traverseFileSystemEntry(
  rootEntry: FileSystemEntry,
  context: FileScanContext
): Promise<File[]> {
  const files: File[] = [];
  const pendingEntries: FileSystemEntry[] = [rootEntry];

  while (pendingEntries.length > 0) {
    const entry = pendingEntries.pop();
    if (!entry) continue;

    context.progress.currentPath = normalizeRelativePath(entry.fullPath || entry.name);

    if (isFileEntry(entry)) {
      const file = await readFileEntry(entry);
      files.push(file);
      context.progress.fileCount += 1;
      await reportFileScanProgress(context);
      continue;
    }

    if (isDirectoryEntry(entry)) {
      context.progress.directoryCount += 1;
      await reportFileScanProgress(context);
      const reader = entry.createReader();
      const childEntries = await readEntriesRecursive(reader, context);
      for (let index = childEntries.length - 1; index >= 0; index -= 1) {
        pendingEntries.push(childEntries[index]);
      }
    }
  }

  return files;
}

async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
  onScanProgress: (progress: DropZoneFileScanProgress) => void
): Promise<File[]> {
  if (!dataTransfer) return [];

  const itemList = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const resolvedFiles: File[] = [];
  const scanContext: FileScanContext = {
    progress: {
      fileCount: 0,
      directoryCount: 0,
    },
    onProgress: onScanProgress,
    lastNotifyAt: 0,
    operationsSinceYield: 0,
  };

  for (const item of itemList) {
    if (item.kind !== 'file') continue;

    const entry = getFileSystemEntry(item);

    if (entry?.isDirectory) {
      try {
        await reportFileScanProgress(scanContext, true);
        const files = await traverseFileSystemEntry(entry, scanContext);
        if (files.length > 0) {
          resolvedFiles.push(...files);
        }
      } catch (error) {
        console.warn('[DropZone] Failed to traverse directory entry', entry?.fullPath, error);
      }
    }

    const directFile = item.getAsFile();
    if (directFile) {
      resolvedFiles.push(directFile);
      continue;
    }

    if (entry?.isFile) {
      try {
        const files = await traverseFileSystemEntry(entry, scanContext);
        if (files.length > 0) {
          resolvedFiles.push(...files);
        }
      } catch (error) {
        console.warn('[DropZone] Failed to traverse file entry', entry?.fullPath, error);
      }
    }
  }

  if (resolvedFiles.length > 0) {
    await reportFileScanProgress(scanContext, true);
    return resolvedFiles;
  }

  return Array.from(dataTransfer.files || []);
}

export function DropZoneScanProgressCard({ progress }: { progress: DropZoneFileScanProgress }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white/95 px-5 py-4 text-gray-900 shadow-xl shadow-black/15">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">フォルダを読み込み中</p>
          <p className="mt-1 text-xs text-gray-600">
            {progress.fileCount.toLocaleString()} 件のファイルを検出
            {progress.directoryCount > 0
              ? ` / ${progress.directoryCount.toLocaleString()} フォルダを確認`
              : ''}
          </p>
          {progress.currentPath && (
            <p className="mt-1 max-w-[320px] truncate text-[11px] text-gray-500">
              {progress.currentPath}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DropZone({
  onDrop,
  onFilesDrop,
  onUrlDrop,
  scanProgress,
  accept = 'image/*,video/*,application/pdf',
  multiple = true,
  children,
  className,
  overlayClassName,
  disabled = false,
}: DropZoneProps) {
  const { dragKind } = useDrag();
  const [isDragActive, setIsDragActive] = useState(false);
  const [internalScanProgress, setInternalScanProgress] = useState<DropZoneFileScanProgress | null>(
    null
  );
  const dragCounter = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const visibleScanProgress = scanProgress ?? internalScanProgress;

  // Use native event listeners for better drag detection
  useEffect(() => {
    const element = dropZoneRef.current;
    if (!element) return;
    if (disabled) {
      setIsDragActive(false);
      return;
    }

    const isFileLikeDrag = (event: DragEvent) => {
      if (dragKind === 'native-image') return false;
      const types = Array.from(event.dataTransfer?.types ?? []);
      if (types.includes(STACK_IDS_MIME)) return false;
      return types.includes('Files') || types.includes('text/uri-list');
    };

    const handleDragEnter = (e: DragEvent) => {
      if (!isFileLikeDrag(e)) return; // Let non-file drags pass through (e.g., stack merge)
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      setIsDragActive(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!isFileLikeDrag(e)) return; // Ignore non-file drags
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;

      if (dragCounter.current === 0) {
        setIsDragActive(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isFileLikeDrag(e)) return; // Ignore non-file drags
      e.preventDefault();
      e.stopPropagation();
      try {
        // Cmd 併用時でも再投入を常に copy として受け付ける
        e.dataTransfer.dropEffect = 'copy';
      } catch {}
    };

    const handleDrop = (e: DragEvent) => {
      const dataTransfer = e.dataTransfer ?? null;
      if (dragKind === 'native-image') return;
      if (Array.from(dataTransfer?.types ?? []).includes(STACK_IDS_MIME)) return;
      debugLogDroppedDataTransfer(dataTransfer);
      const urls = extractUrlsFromDataTransfer(dataTransfer);
      const fileHandler = onDrop ?? onFilesDrop;
      const hasFileHandler = typeof fileHandler === 'function';
      const hasUrlHandler = typeof onUrlDrop === 'function';
      const canHandleUrls = hasUrlHandler && urls.length > 0;

      if (!hasFileHandler && !canHandleUrls) {
        return; // Let stack drops bubble to items
      }

      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      dragCounter.current = 0;

      const acceptedTypes = accept
        .split(',')
        .map((type) => type.trim())
        .filter((type) => type.length > 0);

      void (async () => {
        if (hasFileHandler) {
          setInternalScanProgress({
            fileCount: 0,
            directoryCount: 0,
          });
          const resolvedFiles = await extractFilesFromDataTransfer(
            dataTransfer,
            setInternalScanProgress
          );
          setInternalScanProgress(null);

          if (resolvedFiles.length > 0) {
            const filteredFiles = acceptedTypes.length
              ? resolvedFiles.filter((file) =>
                  acceptedTypes.some((type) => {
                    if (type.endsWith('/*')) {
                      const baseType = type.slice(0, -2);
                      return file.type.startsWith(baseType);
                    }
                    return file.type === type;
                  })
                )
              : resolvedFiles;

            if (filteredFiles.length > 0) {
              if (multiple) {
                fileHandler(filteredFiles);
              } else {
                fileHandler([filteredFiles[0]]);
              }
              return;
            }

            // 受理できるファイルが存在したものの MIME がマッチしない場合はここで終了
            return;
          }
        }

        if (canHandleUrls) {
          onUrlDrop?.(urls, e);
        }
      })().catch((error: unknown) => {
        setInternalScanProgress(null);
        console.warn('[DropZone] Failed to handle dropped files', error);
      });
    };

    element.addEventListener('dragenter', handleDragEnter);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('drop', handleDrop);

    return () => {
      element.removeEventListener('dragenter', handleDragEnter);
      element.removeEventListener('dragleave', handleDragLeave);
      element.removeEventListener('dragover', handleDragOver);
      element.removeEventListener('drop', handleDrop);
      dragCounter.current = 0;
      setInternalScanProgress(null);
    };
  }, [onDrop, onFilesDrop, onUrlDrop, accept, multiple, disabled, dragKind]);

  return (
    <div ref={dropZoneRef} className={cn('relative', className)}>
      {children}

      {/* Drag overlay */}
      {isDragActive && !disabled && (
        <div className={cn('fixed z-50 pointer-events-none', overlayClassName || 'inset-0')}>
          <div className="absolute inset-4 border-4 border-primary bg-primary/20 rounded-lg flex items-center justify-center">
            <div className="bg-white/90 px-6 py-4 rounded-lg shadow-lg">
              <p className="text-lg font-semibold text-gray-800">ドロップしてアップロード</p>
              <p className="text-sm text-gray-600 mt-1">
                {multiple ? '複数のファイルを選択できます' : '1つのファイルを選択してください'}
              </p>
            </div>
          </div>
        </div>
      )}

      {visibleScanProgress && !disabled && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[120]">
          <DropZoneScanProgressCard progress={visibleScanProgress} />
        </div>
      )}
    </div>
  );
}

// Full page drop zone with header-aware overlay
export function FullPageDropZone({
  onDrop,
  onFilesDrop,
  onUrlDrop,
  accept = 'image/*,video/*,application/pdf',
  multiple = true,
  children,
  disabled = false,
}: Omit<DropZoneProps, 'className' | 'overlayClassName' | 'activeClassName' | 'children'> & {
  children: React.ReactNode;
}) {
  return (
    <DropZone
      onDrop={onDrop}
      onFilesDrop={onFilesDrop}
      onUrlDrop={onUrlDrop}
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      className="min-h-screen"
      overlayClassName="top-14 left-0 right-0 bottom-0" // Exclude header (56px = 3.5rem = 14*4px)
    >
      {children}
    </DropZone>
  );
}
