/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  readonly VITE_PUSH_WORKER_URL?: string
  readonly VITE_MAP_TILE_URL?: string
  readonly VITE_GEOCODER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
