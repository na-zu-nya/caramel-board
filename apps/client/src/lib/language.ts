export type AppLanguage = 'en' | 'ja';

export const LANGUAGE_STORAGE_KEY = 'caramelboard.language';

export const isAppLanguage = (value: string | undefined | null): value is AppLanguage =>
  value === 'en' || value === 'ja';

type LanguagePreferenceInput = {
  storedLanguage?: string | null;
  defaultLanguage?: string | null;
  navigatorLanguage?: string | null;
};

type InitializeLanguagePreferenceInput = {
  storage: Storage;
  document: Document;
  defaultLanguage?: string | null;
  navigatorLanguage?: string | null;
};

declare global {
  interface Window {
    __CARAMEL_DEFAULT_LANGUAGE__?: AppLanguage;
  }
}

const getNavigatorDefaultLanguage = (navigatorLanguage: string | undefined | null): AppLanguage =>
  navigatorLanguage?.toLowerCase().startsWith('ja') ? 'ja' : 'en';

export const resolveAppLanguage = ({
  storedLanguage,
  defaultLanguage,
  navigatorLanguage,
}: LanguagePreferenceInput): AppLanguage => {
  if (isAppLanguage(storedLanguage)) return storedLanguage;
  if (isAppLanguage(defaultLanguage)) return defaultLanguage;
  return getNavigatorDefaultLanguage(navigatorLanguage);
};

export const persistAppLanguage = (storage: Storage, document: Document, language: AppLanguage) => {
  storage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
};

export const initializeLanguagePreference = ({
  storage,
  document,
  defaultLanguage,
  navigatorLanguage,
}: InitializeLanguagePreferenceInput): AppLanguage => {
  const storedLanguage = storage.getItem(LANGUAGE_STORAGE_KEY);
  const language = resolveAppLanguage({
    storedLanguage,
    defaultLanguage,
    navigatorLanguage,
  });

  if (!isAppLanguage(storedLanguage)) {
    storage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  document.documentElement.lang = language;

  return language;
};
