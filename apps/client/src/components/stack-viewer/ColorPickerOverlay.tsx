import { useEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { cn, hexForCopy } from '@/lib/utils';

type Props = {
  /** 現在の画像要素を返す（画像以外の場合は null） */
  getImageEl: () => HTMLImageElement | null;
  onCancel: () => void;
  onCopied?: (hex: string) => void;
  /** Altホールド中の一時ピッカーかどうか（Alt離したらコピー判定に使う） */
  altMode?: boolean;
};

function toHex(r: number, g: number, b: number) {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export default function ColorPickerOverlay({
  getImageEl,
  onCancel,
  onCopied,
  altMode = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgCacheRef = useRef<HTMLImageElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hex, setHex] = useState<string>('');
  const [visible, setVisible] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const copiedRef = useRef(false);

  // 準備：キャンバス確保
  const ensureCanvas = () => {
    if (!canvasRef.current) {
      const c = document.createElement('canvas');
      canvasRef.current = c;
      ctxRef.current = c.getContext('2d', { willReadFrequently: true });
    }
  };

  // 画像の描画（初回 or 画像切替時）
  const drawImageIfNeeded = (img: HTMLImageElement) => {
    if (imgCacheRef.current === img) return;
    ensureCanvas();
    const canvas = canvasRef.current!;
    const ctx = ctxRef.current!;
    try {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      imgCacheRef.current = img;
      setError(null);
    } catch (e) {
      console.error('ColorPicker: drawImage failed', e);
      setError('サンプリング不可（CORS など）');
      imgCacheRef.current = null;
    }
  };

  // 色サンプリング
  const sampleAt = (clientX: number, clientY: number) => {
    const img = getImageEl();
    if (!img) {
      setVisible(false);
      return;
    }
    drawImageIfNeeded(img);
    const rect = img.getBoundingClientRect();

    // object-fit: contain の実表示領域を計算
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    const cw = rect.width;
    const ch = rect.height;
    const scale = Math.min(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const left = rect.left + (cw - dw) / 2;
    const top = rect.top + (ch - dh) / 2;
    const right = left + dw;
    const bottom = top + dh;

    const inside = clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
    setVisible(inside);
    if (!inside) return;

    const rx = (clientX - left) / dw;
    const ry = (clientY - top) / dh;
    const x = Math.max(0, Math.min(iw - 1, Math.floor(rx * iw)));
    const y = Math.max(0, Math.min(ih - 1, Math.floor(ry * ih)));
    try {
      const data = ctxRef.current?.getImageData(x, y, 1, 1).data;
      if (data) {
        const [r, g, b, a] = data;
        if (a === 0) {
          setHex('#000000');
        } else {
          setHex(toHex(r, g, b));
        }
      }
    } catch (e) {
      console.error('ColorPicker: getImageData failed', e);
      setError('サンプリング不可');
    }
  };

  // マウス移動
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setPos({ x: e.clientX, y: e.clientY });
    sampleAt(e.clientX, e.clientY);
  };

  const copyAndExit = async () => {
    if (copiedRef.current) return;
    copiedRef.current = true;
    if (!hex) return;
    try {
      const copied = hexForCopy(hex);
      const ok = await copyText(copied);
      if (ok) {
        onCopied?.(copied);
        onCancel();
      } else {
        // 失敗時は再トライできるようにフラグを戻す
        copiedRef.current = false;
      }
    } catch (e) {
      console.error('copy failed', e);
      copiedRef.current = false;
    }
  };
  // クリックでコピー
  const onClick = async () => {
    await copyAndExit();
  };
  // Alt中クリック=pointerupでのコピーにも対応
  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    // 右クリックなどは無視
    if (e.button !== 0) return;
    await copyAndExit();
  };

  // ESCで終了
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [onCancel]);

  // Altキーを離した時、ポインターが画像上ならコピー（Altホールド時のみ）
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        if (altMode && visible) {
          e.stopPropagation();
          e.preventDefault();
          void copyAndExit();
        }
      }
    };
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => window.removeEventListener('keyup', onKeyUp, { capture: true } as any);
  }, [altMode, visible]);

  const lensPos = useMemo(() => {
    const size = 80; // smaller lens
    // Center the lens exactly at cursor position
    let left = pos.x - size / 2;
    let top = pos.y - size / 2;
    // Clamp to viewport to avoid clipping too much
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left < 4) left = 4;
    if (top < 14) top = 14; // below header
    if (left + size > vw - 4) left = vw - size - 4;
    if (top + size > vh - 4) top = vh - size - 4;
    return { left, top, size };
  }, [pos]);

  return (
    <div
      className="fixed top-14 left-0 right-0 bottom-0 z-[65]"
      style={{ cursor: 'crosshair' }}
      onMouseMove={onMove}
      onClick={onClick}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 遮蔽レイヤー（操作無効化用） */}
      <div className="absolute inset-0 bg-transparent" />

      {/* ルーペ */}
      {visible && (
        <div
          className={cn(
            'absolute rounded-full shadow-lg border',
            error ? 'bg-white text-red-600 border-red-300' : 'border-white'
          )}
          style={{
            left: lensPos.left,
            top: lensPos.top,
            width: lensPos.size,
            height: lensPos.size,
            background: hex || 'white',
          }}
        >
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-medium px-2 py-1 rounded-md bg-black/80 text-white whitespace-nowrap">
            {error ? error : hex}
          </div>
        </div>
      )}

      {/* 説明テキスト */}
      <div className="absolute left-4 bottom-4 text-white/90 text-sm select-none">
        クリックでコピー / Escでキャンセル
      </div>
    </div>
  );
}
