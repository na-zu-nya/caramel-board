const FPS_KEY = 'viewer.fps';
const MUTED_KEY = 'viewer.muted';
const VOLUME_KEY = 'viewer.volume';
const COMIC_DISPLAY_MODE_KEY = 'viewer.comicDisplayMode';

export const VIEWER_FPS_OPTIONS = [24, 30, 48, 60] as const;
export type ViewerFps = (typeof VIEWER_FPS_OPTIONS)[number];
export type ViewerComicDisplayMode = 'single' | 'spread';

export function getViewerFps(): ViewerFps {
  try {
    const raw = localStorage.getItem(FPS_KEY);
    const num = raw ? Number(raw) : NaN;
    if (VIEWER_FPS_OPTIONS.includes(num as ViewerFps)) return num as ViewerFps;
  } catch {}
  return 30;
}

export function setViewerFps(v: ViewerFps) {
  try {
    localStorage.setItem(FPS_KEY, String(v));
  } catch {}
}

export function cycleViewerFps(current?: number): ViewerFps {
  const cur =
    current && VIEWER_FPS_OPTIONS.includes(current as ViewerFps)
      ? (current as ViewerFps)
      : getViewerFps();
  const idx = VIEWER_FPS_OPTIONS.indexOf(cur);
  const next = VIEWER_FPS_OPTIONS[(idx + 1) % VIEWER_FPS_OPTIONS.length];
  setViewerFps(next);
  return next;
}

export function getViewerMuted(): boolean {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (raw == null) return false; // default OFF
    return raw === 'true';
  } catch {}
  return false;
}

export function setViewerMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTED_KEY, String(muted));
  } catch {}
}

export function getViewerVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const num = raw ? Number(raw) : NaN;
    if (Number.isFinite(num)) return Math.min(Math.max(num, 0), 1);
  } catch {}
  return 1;
}

export function setViewerVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(Math.max(volume, 0), 1)));
  } catch {}
}

export function getViewerComicDisplayMode(): ViewerComicDisplayMode {
  try {
    const raw = localStorage.getItem(COMIC_DISPLAY_MODE_KEY);
    if (raw === 'single' || raw === 'spread') return raw;
  } catch {}
  return 'single';
}

export function setViewerComicDisplayMode(mode: ViewerComicDisplayMode) {
  try {
    localStorage.setItem(COMIC_DISPLAY_MODE_KEY, mode);
  } catch {}
}
