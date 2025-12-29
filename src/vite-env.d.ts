/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGDB_API_URL: string
  readonly VITE_LANGDB_PROJECT_ID: string
  readonly VITE_LANGDB_API_KEY: string
  /** Enable Lucy AI assistant feature (default: false) */
  readonly VITE_LUCY_ENABLED?: string
  /** Distri server URL (default: http://localhost:8081) */
  readonly VITE_DISTRI_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}