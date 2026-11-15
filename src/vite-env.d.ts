/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** App-Version aus package.json (per Vite `define`). */
declare const __APP_VERSION__: string

/** Build-Zeit und Commit (per Vite `define`). */
declare const __BUILD_STAMP__: string
