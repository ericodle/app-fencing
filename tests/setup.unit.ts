import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// The client is created at module scope in src/lib/supabase.ts and throws
// without these, so every unit test would fail on import rather than on
// anything it meant to assert.
process.env.VITE_SUPABASE_URL ??= 'http://127.0.0.1:64521'
process.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// happy-dom has no matchMedia, and the theme and reduced-motion hooks both
// read it on mount.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
