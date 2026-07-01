import { describe, expect, it } from 'vitest';
import { normalizeVideoMarkers } from '@/lib/video-markers';

describe('video marker normalization', () => {
  it('returns an empty list for nullable or non-array marker payloads', () => {
    expect(normalizeVideoMarkers(null)).toEqual([]);
    expect(normalizeVideoMarkers(undefined)).toEqual([]);
    expect(normalizeVideoMarkers({ time: 1 })).toEqual([]);
  });

  it('keeps valid markers and drops malformed entries', () => {
    expect(
      normalizeVideoMarkers([
        { time: 2, color: 'bright-red', label: 'hit', type: 'scene' },
        { time: Number.NaN, color: 'white' },
        null,
        { time: 3, color: '', type: 'invalid' },
      ])
    ).toEqual([
      { time: 2, color: 'bright-red', label: 'hit', type: 'scene' },
      { time: 3, color: 'white', label: undefined, type: undefined },
    ]);
  });
});
