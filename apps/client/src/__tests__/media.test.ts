import { describe, expect, it } from 'vitest';
import {
  getImageDisplaySource,
  isContentAddressedAssetSource,
  isRawAsset,
  isSvgAsset,
  isVideoAsset,
} from '@/lib/media';
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

  it('uses generated previews for raw assets instead of direct originals', () => {
    const rawAsset = makeAsset({
      file: '/files/raw-reference.dng',
      fileType: 'dng',
      mimeType: 'image/x-adobe-dng',
      preview: '/files/preview/raw-reference.png',
      thumbnail: '/files/thumbnails/raw-reference.jpg',
    });

    expect(isRawAsset(rawAsset)).toBe(true);
    expect(getImageDisplaySource(rawAsset)).toBe('/files/preview/raw-reference.png');

    expect(
      getImageDisplaySource(
        makeAsset({
          file: '/files/raw-reference.dng',
          thumbnail: '/files/thumbnails/raw-reference.jpg',
        })
      )
    ).toBe('/files/thumbnails/raw-reference.jpg');
  });

  it('detects content-addressed local original sources', () => {
    expect(
      isContentAddressedAssetSource(
        '/files/library/2/assets/42/420fa985758d2fa1eedbb4a307321ea0fa38a9ad600097afc14bc7970745c4ef.jpg'
      )
    ).toBe(true);
    expect(
      isContentAddressedAssetSource(
        'http://127.0.0.1:6777/files/library/2/originals/aa/aa0fa985758d2fa1eedbb4a307321ea0fa38a9ad600097afc14bc7970745c4ef.png?cb=1'
      )
    ).toBe(true);
    expect(
      isContentAddressedAssetSource(
        '/files/library/2/preview/42/420fa985758d2fa1eedbb4a307321ea0fa38a9ad600097afc14bc7970745c4ef.jpg'
      )
    ).toBe(false);
    expect(isContentAddressedAssetSource('/files/reference.png')).toBe(false);
  });
});
