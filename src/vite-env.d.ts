/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGDB_API_URL: string
  readonly VITE_LANGDB_PROJECT_ID: string
  readonly VITE_LANGDB_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}