/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_GIT_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
