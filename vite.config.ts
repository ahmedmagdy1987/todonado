import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/**
 * Serve the PRODUCTION security headers in dev and preview too.
 *
 * The values are read straight out of `vercel.json` — the file Vercel actually
 * applies — so there is exactly one source of truth and dev/prod can never
 * drift. That also makes the E2E header assertions meaningful: they check the
 * real deployed values, not a copy.
 *
 * NOTE: the CSP ships as Content-Security-Policy-REPORT-ONLY, so it never blocks
 * anything. In dev you WILL see report-only violations that production won't
 * have — Vite injects an inline HMR preamble and connects over ws://localhost,
 * neither of which exists in a production build. Judge the policy from
 * production reports, not from the dev console.
 */
function vercelSecurityHeaders(): Plugin {
  const config = JSON.parse(
    readFileSync(fileURLToPath(new URL('./vercel.json', import.meta.url)), 'utf8'),
  ) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }

  // The catch-all rule is the one that applies to every route.
  const headers = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? []

  return {
    name: 'todonado:vercel-security-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const { key, value } of headers) res.setHeader(key, value)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        for (const { key, value } of headers) res.setHeader(key, value)
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vercelSecurityHeaders(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // we register manually (src/pwa/registerPwa) to show an update toast
      manifest: false, // keep the hand-written public/manifest.webmanifest (already linked in index.html)
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Precache the built app shell (hashed → immutable, safe cache-first). NOT
        // the marketing screenshots / og-image — those are network-only content.
        globPatterns: ['**/*.{js,css,html,ico,svg,webmanifest,woff2}', 'icons/*.png'],
        globIgnores: ['**/shots/**', '**/og-image.png'],
        // NAVIGATION = NETWORK-FIRST: index.html is always fresh online and can never
        // be served stale "forever"; falls back to the last-cached shell offline.
        // API routes are never treated as a navigation / SPA fallback.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-shell',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        // Supabase is cross-origin and /api/* are POSTs (not navigations) with no
        // matching runtime route, so neither is ever cached — they pass through to
        // the network. (No runtimeCaching entry matches them.)
      },
      // Register the SW in dev too so the E2E can verify it (and so PWA behavior is
      // exercised locally). Network-first navigation keeps dev fresh.
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
})
