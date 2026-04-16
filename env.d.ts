/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OCTADESK_API_HOST?: string
  readonly VITE_OCTADESK_X_API_KEY?: string
  readonly VITE_OCTADESK_API_TOKEN?: string
  readonly VITE_OCTADESK_AGENT_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
