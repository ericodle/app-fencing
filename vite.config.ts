import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { clubConfig } from './piste.config'
import { buildEnvProblems } from './src/vite/build-env'

// The club's config is pure data with no imports, so vite.config can import it
// directly and bake values into index.html and the PWA manifest. That is the
// whole reason piste.config.ts is forbidden from importing anything: three
// separate runtimes read it, and only one of them is the browser.
function pisteHtml(): Plugin {
  return {
    name: 'piste:html',
    transformIndexHtml(html) {
      const tokens: Record<string, string> = {
        '%APP_TITLE%':       clubConfig.identity.clubName,
        '%APP_DESCRIPTION%': clubConfig.identity.description,
        '%THEME_COLOR%':     clubConfig.theme.themeColor,
        '%FAVICON%':         clubConfig.assets.favicon,
      }
      return Object.entries(tokens).reduce(
        (out, [token, value]) => out.replaceAll(token, value), html)
    },
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // loadEnv merges matching process.env keys, so this also catches a missing
    // CI secret in a GitHub Actions build, where no .env.local is present.
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const problems = buildEnvProblems({ ...process.env, ...env })
    if (problems.length > 0) {
      throw new Error(
        'This env cannot produce a shippable bundle:\n' +
        problems.map(p => `  - ${p.variable} ${p.problem}`).join('\n') +
        '\nSet the value in .env.production (or as a CI secret) before building. See docs/deployment.md.',
      )
    }
  }

  return {
    // Pinned, and strict about it. fundive takes 5273 and app-fundivers takes
    // 5173; an unpinned third server would drift to whatever port was free and
    // hand out a different URL each run. Failing to start beats guessing which
    // tab is which.
    server: { port: 5373, strictPort: true },
    plugins: [
      react(),
      tailwindcss(),
      pisteHtml(),
      VitePWA({
        // injectManifest so src/sw.ts owns the service worker: we need `push`
        // and `notificationclick` handlers on top of workbox precaching.
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        // 'prompt', not 'autoUpdate': a freshly-installed worker sits in the
        // waiting state until the member taps the in-app update banner. With
        // autoUpdate the page hard-reloads itself the moment a deploy lands,
        // which is a fine way to lose a half-filled bout sheet.
        registerType: 'prompt',
        includeAssets: ['favicon.png', 'logo.webp', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: clubConfig.identity.clubName,
          short_name: clubConfig.identity.shortName,
          description: clubConfig.identity.description,
          theme_color: clubConfig.theme.themeColor,
          background_color: clubConfig.theme.backgroundColor,
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: clubConfig.assets.icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: clubConfig.assets.icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        injectManifest: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
      }),
    ],
  }
})
