import { beforeEach, describe, expect, it } from 'vitest';
import {
  initializeLanguagePreference,
  LANGUAGE_STORAGE_KEY,
  persistAppLanguage,
  resolveAppLanguage,
} from '../lib/language';

describe('language preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
  });

  it('keeps a saved client language before the server default', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ja');

    const language = initializeLanguagePreference({
      storage: window.localStorage,
      document,
      defaultLanguage: 'en',
      navigatorLanguage: 'en-US',
    });

    expect(language).toBe('ja');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });

  it('stores the server default only when no valid client language exists', () => {
    const language = initializeLanguagePreference({
      storage: window.localStorage,
      document,
      defaultLanguage: 'ja',
      navigatorLanguage: 'en-US',
    });

    expect(language).toBe('ja');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });

  it('persists explicit language changes', () => {
    persistAppLanguage(window.localStorage, document, 'en');

    expect(resolveAppLanguage({ storedLanguage: 'en', defaultLanguage: 'ja' })).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
