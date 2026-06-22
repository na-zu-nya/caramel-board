import { describe, expect, it } from 'vitest';
import { getImageDisplaySource, isSvgAsset, isVideoAsset } from '@/lib/media';
import type { Asset } from '@/types';

const makeAsset = (overrides: Partial<Asset>): Asset => ({
  id: 1,
  stackId: 1,
  file: '/files/reference.png',
  ...overrides,
});

describe('media helpers', () => {
  it('detects svg assets from mime type, file type, and url extension', () => {
    expect(isSvgAsset(makeAsset({ mimeType: 'image/svg+xml; charset=utf-8' }))).toBe(true);
    expect(isSvgAsset(makeAsset({ fileType: 'image/svg+xml' }))).toBe(true);
    expect(isSvgAsset(makeAsset({ fileType: '.svgz' }))).toBe(true);
    expect(isSvgAsset(makeAsset({ file: '/files/vector.svg?token=1' }))).toBe(true);
    expect(isSvgAsset(makeAsset({ originalName: 'reference.svg' }))).toBe(true);
  });

  it('keeps svg assets out of video detection', () => {
    const asset = makeAsset({
      file: '/files/vector.svg',
      mimeType: 'image/svg+xml',
      preview: '/files/preview/vector.png',
    });

    expect(isVideoAsset(asset)).toBe(false);
  });

  it('detects video preview assets without treating image previews as video', () => {
    expect(
      isVideoAsset(makeAsset({ file: '/files/animation.gif', preview: '/files/preview/a.mp4' }))
    ).toBe(true);
    expect(
      isVideoAsset(makeAsset({ file: '/files/vector.svg', preview: '/files/preview/a.png' }))
    ).toBe(false);
  });

  it('uses rasterized previews for svg display while keeping originals for normal images', () => {
    expect(
      getImageDisplaySource(
        makeAsset({
          file: '/files/vector.svg',
          preview: '/files/preview/vector.png',
          thumbnail: '/files/thumbnails/vector.jpg',
        })
      )
    ).toBe('/files/preview/vector.png');

    expect(
      getImageDisplaySource(
        makeAsset({
          file: '/files/reference.png',
          thumbnail: '/files/thumbnails/reference.jpg',
        })
      )
    ).toBe('/files/reference.png');
  });
});
