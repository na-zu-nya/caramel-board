const fallbackVersion = '0.0.0';
const fallbackHash = 'unknown';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || fallbackVersion;

export const APP_GIT_HASH = import.meta.env.VITE_APP_GIT_HASH || fallbackHash;
