import { describe, expect, it } from 'vitest';
import {
  applyBrowserRenderingProfile,
  resolveBrowserRenderingProfile,
} from '../lib/browser-rendering';

describe('browser rendering profile', () => {
  it('detects Google Chrome from user agent client hints', () => {
    expect(
      resolveBrowserRenderingProfile({
        userAgent: 'unused',
        userAgentData: {
          brands: [
            { brand: 'Chromium', version: '126' },
            { brand: 'Google Chrome', version: '126' },
          ],
        },
      })
    ).toBe('chrome');
  });

  it('detects Google Chrome from the legacy user agent', () => {
    expect(
      resolveBrowserRenderingProfile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      })
    ).toBe('chrome');
  });

  it('keeps Safari and Chrome on iOS unprofiled', () => {
    expect(
      resolveBrowserRenderingProfile({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      })
    ).toBeUndefined();
    expect(
      resolveBrowserRenderingProfile({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
      })
    ).toBeUndefined();
  });

  it('writes the rendering profile to the document element', () => {
    applyBrowserRenderingProfile(document, {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    expect(document.documentElement.dataset.renderingProfile).toBe('chrome');

    applyBrowserRenderingProfile(document, {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    });

    expect(document.documentElement.dataset.renderingProfile).toBeUndefined();
  });
});
