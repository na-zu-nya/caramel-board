import type { SidecarStatus } from './types';

export const defaultStatus: SidecarStatus = {
  running: false,
  url: 'http://127.0.0.1:6777',
  pid: null,
  startedAt: null,
};

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0';
export const APP_GIT_HASH = import.meta.env.VITE_APP_GIT_HASH || 'unknown';
export const FANBOX_URL = 'https://na-zu-nya.fanbox.cc/';
export const X_URL = 'https://x.com/na_zu_nya';
export const GITHUB_URL = 'https://github.com/na-zu-nya/caramel-board';
