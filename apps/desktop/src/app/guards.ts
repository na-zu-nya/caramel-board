import type { AppLanguage, BooleanSettingKey, ResidentMode, TextSettingKey } from './types';

export const isAppLanguage = (value: string | undefined): value is AppLanguage =>
  value === 'en' || value === 'ja';

export const isResidentMode = (value: string | undefined): value is ResidentMode =>
  value === 'taskbar' || value === 'tray';

export const isTextSettingKey = (value: string | undefined): value is TextSettingKey =>
  value === 'dbPath' ||
  value === 'libraryPath' ||
  value === 'basicAuthUsername' ||
  value === 'basicAuthPassword' ||
  value === 'autoTagRepoDir' ||
  value === 'autoTagModelDir' ||
  value === 'ffmpegPath' ||
  value === 'pdfRasterizerPath';

export const isBooleanSettingKey = (value: string | undefined): value is BooleanSettingKey =>
  value === 'allowExternalNetwork' ||
  value === 'basicAuthEnabled' ||
  value === 'autoTagEnabled' ||
  value === 'launchOnStartup';
