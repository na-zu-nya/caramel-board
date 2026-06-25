import { ClipboardPaste, FilePlus2, Plus, X } from 'lucide-react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_ACCEPT,
  extractFilesFromDataTransfer,
  extractUrlsFromDataTransfer,
  filterAcceptedFiles,
} from '@/components/ui/DropZone';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type FloatingUploadActionVariant = 'fab' | 'toolbar';
type FloatingUploadActionPlacement = 'top-start' | 'top-end';

interface FloatingUploadActionProps {
  onFiles: (files: File[]) => void;
  onUrls?: (urls: string[]) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  variant?: FloatingUploadActionVariant;
  placement?: FloatingUploadActionPlacement;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  closeOnOutsidePointerDown?: boolean;
}

const placementClassNames: Record<FloatingUploadActionPlacement, string> = {
  'top-start': 'bottom-[calc(100%+0.75rem)] left-0',
  'top-end': 'bottom-[calc(100%+0.75rem)] right-0',
};

export function FloatingUploadAction({
  onFiles,
  onUrls,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  disabled = false,
  variant = 'fab',
  placement = 'top-start',
  className,
  buttonClassName,
  panelClassName,
  closeOnOutsidePointerDown = false,
}: FloatingUploadActionProps) {
  const t = useT();
  const inputId = useId();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const commitFiles = useCallback(
    (files: File[], source: 'selected' | 'pasted') => {
      const acceptedFiles = filterAcceptedFiles(files, accept);
      const targetFiles = multiple ? acceptedFiles : acceptedFiles.slice(0, 1);

      if (targetFiles.length === 0) {
        setFeedback(t.upload.noSupportedFiles);
        return;
      }

      onFiles(targetFiles);
      setFeedback(
        source === 'selected'
          ? t.upload.selectedFiles(targetFiles.length)
          : t.upload.pastedFiles(targetFiles.length)
      );
    },
    [accept, multiple, onFiles, t]
  );

  const handleButtonClick = useCallback(() => {
    if (disabled) return;
    setOpen((current) => !current);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.currentTarget.files ?? []);
      if (files.length > 0) {
        commitFiles(files, 'selected');
      }
      event.currentTarget.value = '';
    },
    [commitFiles]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      event.preventDefault();
      const dataTransfer = event.clipboardData;

      void (async () => {
        const files = await extractFilesFromDataTransfer(dataTransfer, () => undefined);
        if (files.length > 0) {
          commitFiles(files, 'pasted');
          if (pasteRef.current) pasteRef.current.value = '';
          return;
        }

        const urls = extractUrlsFromDataTransfer(dataTransfer);
        if (urls.length > 0 && onUrls) {
          await onUrls(urls);
          setFeedback(t.upload.pastedUrls(urls.length));
          if (pasteRef.current) pasteRef.current.value = '';
          return;
        }

        setFeedback(t.upload.noPasteItems);
        if (pasteRef.current) pasteRef.current.value = '';
      })().catch((error: unknown) => {
        console.warn('[FloatingUploadAction] Failed to handle pasted content', error);
        setFeedback(t.upload.noPasteItems);
      });
    },
    [commitFiles, onUrls, t]
  );

  const handlePasteClick = useCallback(() => {
    pasteRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open || !closeOnOutsidePointerDown || typeof document === 'undefined') return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    };
  }, [closeOnOutsidePointerDown, open]);

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-flex', variant === 'fab' && 'z-[70]', className)}
    >
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        aria-label={t.upload.addMedia}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          'inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:pointer-events-none disabled:opacity-50',
          variant === 'fab'
            ? 'h-14 w-14 rounded-full border border-primary/20 bg-white text-primary shadow-xl shadow-black/20 hover:bg-gray-50 active:bg-gray-100'
            : 'rounded-full border border-primary/20 bg-white p-3 text-primary shadow-lg shadow-black/20 hover:bg-gray-50 active:bg-gray-100',
          buttonClassName
        )}
      >
        <Plus size={variant === 'fab' ? 26 : 20} />
      </button>

      {open && (
        <div
          id={panelId}
          className={cn(
            'absolute z-[90] w-72 overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl shadow-black/25',
            placementClassNames[placement],
            panelClassName
          )}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
            <span className="text-sm font-semibold">{t.upload.addMedia}</span>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              aria-label={t.common.close}
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3 p-3">
            <input
              id={inputId}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={handleFileChange}
              className="sr-only"
            />
            <label
              htmlFor={inputId}
              className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-primary/30 bg-white px-3 text-sm font-semibold text-primary transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <FilePlus2 size={18} />
              {t.upload.chooseFiles}
            </label>

            <textarea
              ref={pasteRef}
              rows={3}
              aria-label={t.upload.pasteAreaLabel}
              placeholder={t.upload.pasteAreaPlaceholder}
              onPaste={handlePaste}
              onClick={handlePasteClick}
              className="min-h-24 w-full resize-none rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-[16px] leading-5 text-gray-700 outline-none transition-colors placeholder:text-gray-500 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
            />

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ClipboardPaste size={14} />
              <span>{t.upload.pasteAreaHint}</span>
            </div>

            {feedback && <p className="text-xs font-medium text-gray-700">{feedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
