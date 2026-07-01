import type { VideoMarker } from '@/types';

export const normalizeVideoMarkers = (markers: unknown): VideoMarker[] => {
  if (!Array.isArray(markers)) return [];

  const normalized: VideoMarker[] = [];
  for (const marker of markers) {
    if (!marker || typeof marker !== 'object') continue;
    const record = marker as Record<string, unknown>;
    const time =
      typeof record.time === 'number' && Number.isFinite(record.time) ? record.time : null;
    if (time === null) continue;

    const color = typeof record.color === 'string' && record.color ? record.color : 'white';
    const label = typeof record.label === 'string' ? record.label : undefined;
    const type =
      record.type === 'ghost' || record.type === 'scene' || record.type === 'finish'
        ? record.type
        : undefined;
    normalized.push({ time, color, label, type });
  }

  return normalized;
};
