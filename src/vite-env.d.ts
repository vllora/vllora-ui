/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANGDB_API_URL: string
  readonly VITE_LANGDB_PROJECT_ID: string
  readonly VITE_LANGDB_API_KEY: string
  /** Agent panel mode: 'floating' (default) or 'side-panel' */
  readonly VITE_AGENT_PANEL_MODE?: 'floating' | 'side-panel'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}