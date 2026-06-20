import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyThumbnailBlur,
  installThumbnailBlurConsoleCommand,
  normalizeThumbnailBlurRadius,
} from '@/lib/thumbnail-blur';

describe('thumbnail blur', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('caramel-thumbnail-blur-active');
    document.documentElement.style.removeProperty('--caramel-thumbnail-blur-radius');
    window.$ = undefined;
  });

  it('normalizes numeric radius values to px', () => {
    expect(normalizeThumbnailBlurRadius(12)).toBe('12px');
    expect(normalizeThumbnailBlurRadius('8')).toBe('8px');
    expect(normalizeThumbnailBlurRadius(-4)).toBe('0px');
  });

  it('applies the active class and blur radius to the document root', () => {
    const applied = applyThumbnailBlur(document, '14px');

    expect(applied).toBe('14px');
    expect(document.documentElement.classList.contains('caramel-thumbnail-blur-active')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--caramel-thumbnail-blur-radius')).toBe(
      '14px'
    );
  });

  it('installs $.blur without replacing an existing command target', () => {
    const existingDollar = { existing: true };
    window.$ = existingDollar;

    installThumbnailBlurConsoleCommand(window);

    expect(window.$).toBe(existingDollar);
    expect(window.$?.blur?.('16px')).toBe('16px');
    expect(document.documentElement.style.getPropertyValue('--caramel-thumbnail-blur-radius')).toBe(
      '16px'
    );
  });
});
