import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type UrlDropHandler = (urls: string[], event: DragEvent) => void;

interface DropZoneProps {
  onDrop?: (files: File[]) => void;
  onFilesDrop?: (files: File[]) => void;
  onUrlDrop?: UrlDropHandler;
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

function extractUrlsFromDataTransfer(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];

  const rawUrls: string[] = [];
  const uriList = dataTransfer.getData('text/uri-list');
  if (uriList) {
    for (const line1 of uriList
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))) {
      rawUrls.push(line1);
    }
  }

  if (rawUrls.length === 0) {
    const plain = dataTransfer.getData('text/plain')?.trim();
    if (plain && /^https?:\/\//i.test(plain)) {
      rawUrls.push(plain);
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

export function DropZone({
  onDrop,
  onFilesDrop,
  onUrlDrop,
  accept = 'image/*,video/*,application/pdf',
  multiple = true,
  children,
  className,
  overlayClassName,
  disabled = false,
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Use native event listeners for better drag detection
  useEffect(() => {
    const element = dropZoneRef.current;
    if (!element) return;
    if (disabled) {
      setIsDragActive(false);
      return;
    }

    const isFileLikeDrag = (event: DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? []);
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
    };

    const handleDrop = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      const dataTransferItems = Array.from(e.dataTransfer?.items ?? []);
      const hasFilePayload =
        types.includes('Files') || dataTransferItems.some((item) => item.kind === 'file');
      const urls = extractUrlsFromDataTransfer(e.dataTransfer ?? null);
      const fileHandler = onDrop ?? onFilesDrop;
      const shouldHandleFiles = hasFilePayload && typeof fileHandler === 'function';
      const shouldHandleUrls =
        urls.length > 0 &&
        typeof onUrlDrop === 'function' &&
        (!hasFilePayload || !shouldHandleFiles);

      if (!shouldHandleFiles && !shouldHandleUrls) {
        return; // Let stack drops bubble to items
      }

      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      dragCounter.current = 0;

      if (shouldHandleFiles && e.dataTransfer?.files?.length) {
        const fileList = Array.from(e.dataTransfer.files);
        const acceptedTypes = accept
          .split(',')
          .map((type) => type.trim())
          .filter((type) => type.length > 0);

        const filteredFiles = acceptedTypes.length
          ? fileList.filter((file) =>
              acceptedTypes.some((type) => {
                if (type.endsWith('/*')) {
                  const baseType = type.slice(0, -2);
                  return file.type.startsWith(baseType);
                }
                return file.type === type;
              })
            )
          : fileList;

        if (filteredFiles.length > 0) {
          if (multiple) {
            fileHandler(filteredFiles);
          } else {
            fileHandler([filteredFiles[0]]);
          }
        }
      }

      if (shouldHandleUrls) {
        // Safari ではファイルとURLが同時に渡されるため、ファイルを処理した場合はURLを実行しない
        onUrlDrop(urls, e);
      }
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
    };
  }, [onDrop, onFilesDrop, onUrlDrop, accept, multiple, disabled]);

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
