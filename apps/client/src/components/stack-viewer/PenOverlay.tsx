import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Eraser, Trash2, Undo2, Redo2, X, SlidersHorizontal, PenTool, Eye, EyeOff, Layers, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stateless presentational helpers (no hooks)
function ToolButton({
  onClick,
  aria,
  active,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  aria: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'w-9 h-9 rounded-md border text-gray-800 flex items-center justify-center',
        'transition-colors',
        active ? 'bg-blue-50 border-blue-300' : 'bg-white/95 border-gray-300 hover:bg-gray-50',
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      )}
      onClick={disabled ? undefined : onClick}
      aria-label={aria}
      title={title || aria}
    >
      {children}
    </button>
  );
}

function PopCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-12 top-0 bg-white/98 border border-gray-300 rounded-md p-3 w-56 shadow-sm z-[70]" style={{ pointerEvents: 'auto' }}>
      {children}
    </div>
  );
}

function ColorSwatch({ value, active, onClick }: { value: string; active?: boolean; onClick?: (v: string) => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-6 h-6 rounded-sm border transition-transform hover:scale-105',
        value === '#FFFFFF' ? 'border-gray-300' : 'border-white',
        active ? 'ring-2 ring-blue-500' : ''
      )}
      style={{ backgroundColor: value }}
      onClick={() => onClick?.(value)}
      aria-label={`Set color ${value}`}
    />
  );
}

type Stroke = {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  opacity: number; // 0..1
  mode: 'draw' | 'erase';
};

interface PenOverlayProps {
  leftInset: number;
  rightInset: number;
  topInset?: number;
  docKey: string; // page identity; change -> clear
  onExit: () => void;
  getImageEl?: () => HTMLImageElement | null;
}

const DEFAULT_COLORS = [
  '#FF3B30', // red
  '#FF9500', // orange
  '#FFCC00', // yellow
  '#34C759', // green
  '#32ADE6', // cyan
  '#007AFF', // blue
  '#AF52DE', // purple
  // removed second red-ish (#FF2D55)
  '#000000', // black
  '#808080', // gray
  '#FFFFFF', // white
];

export default function PenOverlay({ leftInset, rightInset, topInset = 56, docKey, onExit, getImageEl }: PenOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // base canvas: committed strokes
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  // preview canvas: in-progress stroke, cleared each frame
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dprRef = useRef<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  const [color, setColor] = useState<string>('#FF3B30');
  const [size, setSize] = useState<number>(4); // default 4px
  const [opacity, setOpacity] = useState<number>(1);
  const [eraser, setEraser] = useState<boolean>(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [openPanel, setOpenPanel] = useState<'none' | 'size' | 'opacity' | 'color'>('none');
  const [layerOpacity, setLayerOpacity] = useState<number>(1);
  const [layerVisible, setLayerVisible] = useState<boolean>(true);
  const [bgFade, setBgFade] = useState<number>(0);
  const [openAuxPanel, setOpenAuxPanel] = useState<'none' | 'layer' | 'bg'>('none');
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false); // 操作中のみにミニプレビュー表示
  const [bgRect, setBgRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Clear strokes when page key changes
  useEffect(() => {
    clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const ensureCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = (window.devicePixelRatio || 1);
    dprRef.current = dpr;
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // HiDPI
        ctx.clearRect(0, 0, cssW, cssH);
        // redraw existing strokes (e.g., on resize)
        redrawAll(ctx, strokes, cssW, cssH, layerVisible ? layerOpacity : 0);
      }
    }
    // preview canvas resize as well
    const p = previewCanvasRef.current;
    if (p) {
      if (p.width !== Math.floor(cssW * dpr) || p.height !== Math.floor(cssH * dpr)) {
        p.width = Math.floor(cssW * dpr);
        p.height = Math.floor(cssH * dpr);
        p.style.width = `${cssW}px`;
        p.style.height = `${cssH}px`;
      }
      const pctx = p.getContext('2d');
      previewCtxRef.current = pctx;
      if (pctx) {
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pctx.clearRect(0, 0, cssW, cssH);
      }
    }
  }, [strokes]);

  useEffect(() => {
    ensureCanvas();
    const onResize = () => ensureCanvas();
    window.addEventListener('resize', onResize);
    const ro = containerRef.current ? new ResizeObserver(onResize) : null;
    if (containerRef.current && ro) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [ensureCanvas]);

  // Track image rect for background fade (image-only overlay)
  useEffect(() => {
    const updateRect = () => {
      if (!getImageEl) { setBgRect(null); return; }
      const img = getImageEl();
      const container = containerRef.current;
      if (!img || !container) { setBgRect(null); return; }
      const ir = img.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      setBgRect({ left: Math.max(0, ir.left - cr.left), top: Math.max(0, ir.top - cr.top), width: ir.width, height: ir.height });
    };
    updateRect();
    const onScroll = () => updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true } as any);
    const iv = setInterval(updateRect, 250); // guard for subtle layout shifts
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', onScroll, { capture: true } as any);
      clearInterval(iv);
    };
  }, [getImageEl, docKey, leftInset, rightInset, topInset]);

  const drawStrokePath = useCallback((ctx: CanvasRenderingContext2D, s: Stroke, alphaFactor = 1) => {
    const n = s.points.length;
    if (n < 2) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity * alphaFactor));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = s.size;
    ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.mode === 'erase' ? 'rgba(0,0,0,1)' : s.color;
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
    ctx.restore();
  }, []);

  const redrawAll = useCallback((ctx: CanvasRenderingContext2D, all: Stroke[], w: number, h: number, alphaFactor = 1) => {
    ctx.clearRect(0, 0, w, h);
    for (const s of all) drawStrokePath(ctx, s, alphaFactor);
  }, [drawStrokePath]);

  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const activePointerRef = useRef<number | null>(null);

  const toLocal = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // primary only
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    activePointerRef.current = e.pointerId;
    // New stroke begins → redo ヒストリを破棄
    if (redoStack.length) setRedoStack([]);
    const p = toLocal(e);
    const s: Stroke = {
      points: [p, p],
      color,
      size,
      opacity,
      mode: eraser ? 'erase' : 'draw',
    };
    setActiveStroke(s);
    // render preview stroke as whole path
    const pctx = previewCtxRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (pctx) {
      pctx.clearRect(0, 0, Math.floor(rect.width), Math.floor(rect.height));
      drawStrokePath(pctx, s, 1);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId || !activeStroke) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toLocal(e);
    setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev));
    // live preview
    const pctx = previewCtxRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (pctx) {
      pctx.clearRect(0, 0, Math.floor(rect.width), Math.floor(rect.height));
      const s = { ...activeStroke, points: [...activeStroke.points, p] };
      drawStrokePath(pctx, s, 1);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
    activePointerRef.current = null;
    if (activeStroke) {
      // clear preview then push and repaint base with layer opacity
      const rect = canvasRef.current!.getBoundingClientRect();
      const pctx = previewCtxRef.current;
      if (pctx) pctx.clearRect(0, 0, Math.floor(rect.width), Math.floor(rect.height));
      setStrokes((prev) => {
        const next = [...prev, activeStroke];
        const ctx = ctxRef.current;
        if (ctx) redrawAll(ctx, next, Math.floor(rect.width), Math.floor(rect.height), layerVisible ? layerOpacity : 0);
        return next;
      });
      setActiveStroke(null);
    }
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (strokes.length === 0) return;
    const next = strokes.slice();
    const popped = next.pop()!;
    setStrokes(next);
    setRedoStack((r) => [...r, popped]);
    redrawAll(ctx, next, w, h, layerVisible ? layerOpacity : 0);
  };

  const redo = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    if (redoStack.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    const nextRedo = redoStack.slice();
    const restored = nextRedo.pop()!;
    const nextStrokes = [...strokes, restored];
    setRedoStack(nextRedo);
    setStrokes(nextStrokes);
    redrawAll(ctx, nextStrokes, w, h, layerVisible ? layerOpacity : 0);
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) {
      setStrokes([]);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    ctx.clearRect(0, 0, w, h);
    const pctx = previewCtxRef.current;
    if (pctx) pctx.clearRect(0, 0, w, h);
    setStrokes([]);
    setRedoStack([]);
  };

  // layer opacity / visibility changes ⇒ repaint
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    redrawAll(ctx, strokes, Math.floor(rect.width), Math.floor(rect.height), layerVisible ? layerOpacity : 0);
  }, [layerOpacity, layerVisible, strokes, redrawAll]);

  // ESC to exit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [onExit]);

  // Cmd/Ctrl + Z/Y ショートカット（Undo/Redo）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // 入力系は無視
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target as any)?.isContentEditable) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      // Cmd/Ctrl+Z → Undo, Shift 併用で Redo（mac 標準）
      if (key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // Cmd/Ctrl+Y → Redo（Windows 標準）
      if (key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        redo();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, [undo, redo]);

  const ToolPalette = useMemo(() => {
    const SizeGlyph = () => (
      <div className="relative w-5 h-5">
        <div
          className="absolute rounded-full bg-gray-800"
          style={{
            width: Math.max(2, Math.min(14, size)) + 'px',
            height: Math.max(2, Math.min(14, size)) + 'px',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    );

    const ColorGlyph = () => (
      <div className="w-5 h-5 rounded-sm border" style={{ backgroundColor: color, borderColor: '#e5e7eb' }} />
    );

    const hexToRgb = (hex: string) => {
      const v = hex.replace('#', '');
      const bigint = parseInt(v, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return { r, g, b };
    };
    const rgba = (hex: string, a: number) => {
      const { r, g, b } = hexToRgb(hex);
      return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
    };

    const BrushPreview = () => (
      <div className="mt-2 flex items-center gap-3">
        <div className="relative w-10 h-10">
          <div
            className="absolute rounded-full"
            style={{
              width: Math.max(2, Math.min(32, size)) + 'px',
              height: Math.max(2, Math.min(32, size)) + 'px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: rgba(color, opacity),
            }}
          />
          <div
            className="absolute rounded-full ring-1 ring-black/30"
            style={{
              width: Math.max(2, Math.min(32, size)) + 'px',
              height: Math.max(2, Math.min(32, size)) + 'px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
        <div className="flex-1 h-4 rounded-full overflow-hidden">
          <div className="h-full" style={{ width: Math.max(2, Math.min(100, size * 3)) + 'px', background: rgba(color, opacity) }} />
        </div>
        <div className="text-xs text-gray-600 w-12 text-right">{size}px</div>
      </div>
    );


    const MiniBrush = () => (
      <div className="absolute right-12 top-1/2 -translate-y-1/2 z-[70]" style={{ pointerEvents: 'none' }}>
        <div className="w-12 h-12 rounded-md bg-white/90 border border-gray-300 flex items-center justify-center shadow-sm">
          <div
            className="rounded-full ring-1 ring-black/30"
            style={{ width: Math.max(2, Math.min(32, size)) + 'px', height: Math.max(2, Math.min(32, size)) + 'px', background: rgba(color, opacity) }}
          />
        </div>
      </div>
    );

    return (
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[66]" style={{ pointerEvents: 'auto' }}>
        {isAdjusting && <MiniBrush />}
        <div className="flex flex-col gap-2 bg-white/80 backdrop-blur-sm p-1 rounded-md border border-gray-300" style={{ pointerEvents: 'auto' }}>
          {/* Tool mode: Pen or Eraser (exclusive) */}
          <ToolButton aria="Pen" active={!eraser} onClick={() => setEraser(false)}>
            <PenTool size={16} />
          </ToolButton>
          <ToolButton aria="Eraser" active={eraser} onClick={() => setEraser(true)}>
            <Eraser size={16} />
          </ToolButton>

          {/* Size */}
          <div className="relative">
            <ToolButton aria={`Size ${size}px`} active={openPanel === 'size'} onClick={() => setOpenPanel((p) => (p === 'size' ? 'none' : 'size'))}>
              <SizeGlyph />
            </ToolButton>
            {openPanel === 'size' && (
              <PopCard>
                <div className="text-xs text-gray-600 mb-2">Size: {size}px</div>
                <div onPointerDown={() => setIsAdjusting(true)} onPointerUp={() => setIsAdjusting(false)} onPointerCancel={() => setIsAdjusting(false)}>
                  <Slider min={1} max={32} step={1} value={[size]} onValueChange={(v) => setSize(v[0] ?? 4)} />
                </div>
                <BrushPreview />
              </PopCard>
            )}
          </div>

          {/* Opacity */}
          <div className="relative">
            <ToolButton aria={`Opacity ${Math.round(opacity * 100)}%`} active={openPanel === 'opacity'} onClick={() => setOpenPanel((p) => (p === 'opacity' ? 'none' : 'opacity'))}>
              <SlidersHorizontal size={16} />
            </ToolButton>
            {openPanel === 'opacity' && (
              <PopCard>
                <div className="text-xs text-gray-600 mb-2">Opacity: {Math.round(opacity * 100)}%</div>
                <div onPointerDown={() => setIsAdjusting(true)} onPointerUp={() => setIsAdjusting(false)} onPointerCancel={() => setIsAdjusting(false)}>
                  <Slider min={0.1} max={1} step={0.05} value={[opacity]} onValueChange={(v) => setOpacity(v[0] ?? 1)} />
                </div>
                <BrushPreview />
              </PopCard>
            )}
          </div>

          {/* Color */}
          <div className="relative">
            <ToolButton aria={`Color ${color}`} active={openPanel === 'color'} onClick={() => setOpenPanel((p) => (p === 'color' ? 'none' : 'color'))}>
              <ColorGlyph />
            </ToolButton>
            {openPanel === 'color' && (
              <PopCard>
                <div className="text-xs text-gray-600 mb-2">Color</div>
                <div className="grid grid-cols-6 gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <ColorSwatch key={c} value={c} active={c === color} onClick={(v) => setColor(v)} />
                  ))}
                </div>
                <BrushPreview />
              </PopCard>
            )}
          </div>

          {/* Undo/Redo */}
          <ToolButton aria="Undo" disabled={strokes.length === 0} onClick={undo} title="Undo (⌘/Ctrl+Z)">
            <Undo2 size={16} />
          </ToolButton>
          <ToolButton aria="Redo" disabled={redoStack.length === 0} onClick={redo} title="Redo (⌘/Ctrl+Shift+Z / Ctrl+Y)">
            <Redo2 size={16} />
          </ToolButton>

          {/* Layer opacity / visibility */}
          <ToolButton aria={layerVisible ? 'Hide pen layer' : 'Show pen layer'} onClick={() => setLayerVisible((v) => !v)}>
            {layerVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          </ToolButton>
          <div className="relative">
            <ToolButton aria={`Layer opacity ${Math.round(layerOpacity * 100)}%`} active={openAuxPanel === 'layer'} onClick={() => setOpenAuxPanel((p) => (p === 'layer' ? 'none' : 'layer'))}>
              <Layers size={16} />
            </ToolButton>
            {openAuxPanel === 'layer' && (
              <PopCard>
                <div className="text-xs text-gray-600 mb-2">Pen layer opacity: {Math.round(layerOpacity * 100)}%</div>
                <div onPointerDown={() => setIsAdjusting(true)} onPointerUp={() => setIsAdjusting(false)} onPointerCancel={() => setIsAdjusting(false)}>
                  <Slider min={0} max={1} step={0.05} value={[layerOpacity]} onValueChange={(v) => setLayerOpacity(v[0] ?? 1)} />
                </div>
              </PopCard>
            )}
          </div>

          {/* Background fade */}
          <div className="relative">
            <ToolButton aria={`Background fade ${Math.round(bgFade * 100)}%`} active={openAuxPanel === 'bg'} onClick={() => setOpenAuxPanel((p) => (p === 'bg' ? 'none' : 'bg'))}>
              <Sun size={16} />
            </ToolButton>
            {openAuxPanel === 'bg' && (
              <PopCard>
                <div className="text-xs text-gray-600 mb-2">Background fade: {Math.round(bgFade * 100)}%</div>
                <div onPointerDown={() => setIsAdjusting(true)} onPointerUp={() => setIsAdjusting(false)} onPointerCancel={() => setIsAdjusting(false)}>
                  <Slider min={0} max={0.9} step={0.05} value={[bgFade]} onValueChange={(v) => setBgFade(v[0] ?? 0)} />
                </div>
              </PopCard>
            )}
          </div>

          {/* Clear */}
          <ToolButton aria="Clear all" onClick={clearAll}>
            <Trash2 size={16} />
          </ToolButton>

          {/* Exit */}
          <ToolButton aria="Exit pen mode" onClick={onExit}>
            <X size={16} />
          </ToolButton>
        </div>
      </div>
    );
  }, [eraser, openPanel, openAuxPanel, size, opacity, color, strokes.length, redoStack.length, layerOpacity, layerVisible, bgFade, onExit]);

  return (
    <div
      ref={containerRef}
      className="fixed z-[64]"
      style={{
        left: `${leftInset}px`,
        right: `${rightInset}px`,
        top: `${topInset}px`,
        bottom: 0,
        pointerEvents: 'auto',
      }}
    >
      {/* Background fade overlay (image region only) */}
      {bgRect && bgFade > 0 && (
        <div
          className="absolute"
          style={{
            left: `${bgRect.left}px`,
            top: `${bgRect.top}px`,
            width: `${bgRect.width}px`,
            height: `${bgRect.height}px`,
            background: `rgba(255,255,255, ${bgFade})`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Drawing layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: (isAdjusting || openPanel !== 'none' || openAuxPanel !== 'none') ? 'none' : 'auto', touchAction: 'none', cursor: eraser ? 'crosshair' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {/* Preview layer for current stroke (no pointer events) */}
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      />
      {/* Minimal tool palette (vertical) */}
      {ToolPalette}
    </div>
  );
}
