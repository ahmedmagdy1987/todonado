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
 * THE CSP IS ENFORCING IN PRODUCTION AND REPORT-ONLY HERE, and that difference
 * is deliberate rather than sloppy (audit FLAG-11). Vite injects an inline HMR
 * preamble and connects over ws://localhost; `script-src 'self'` and the
 * connect-src list forbid both, so serving the production header verbatim in
 * dev would break the dev server outright. Downgrading the KEY — and nothing
 * else — keeps one source of truth for the policy VALUE while letting dev run.
 * You will still see report-only violations locally that production never has.
 */
function vercelSecurityHeaders(): Plugin {
  const config = JSON.parse(
    readFileSync(fileURLToPath(new URL('./vercel.json', import.meta.url)), 'utf8'),
  ) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }

  // The catch-all rule is the one that applies to every route.
  const productionHeaders = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? []

  /** Same policy, downgraded to report-only, for dev and preview only. */
  const headers = productionHeaders.map(({ key, value }) =>
    key === 'Content-Security-Policy'
      ? { key: 'Content-Security-Policy-Report-Only', value }
      : { key, value },
  )

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

/**
 * Serve `api/*.ts` from the dev/preview server.
 *
 * Vite alone does not run the serverless functions, so `/api/...` used to 404
 * locally and the endpoints were only ever exercised in production. The handlers
 * already export a Node-contract `(req, res)` default (see _lib/nodeAdapter), so
 * mounting them is just a module load away — and it means the E2E can drive the
 * real endpoint instead of trusting it.
 *
 * Dev only (`apply: 'serve'`). Local runs have no SUPABASE_SERVICE_ROLE_KEY, so
 * the auth-requiring endpoints answer 503 `not_configured` rather than 401 —
 * still a rejection, never data. The 401 path is covered by unit tests.
 */
function devApiRoutes(): Plugin {
  return {
    name: 'todonado:dev-api-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith('/api/')) return next()
        // Strict allow-list shape: no traversal, no nested paths.
        const route = path.slice('/api/'.length)
        if (!/^[a-z0-9-]+$/i.test(route)) return next()

        void (async () => {
          try {
            const mod = await server.ssrLoadModule(`/api/${route}.ts`)
            const handler = (mod as { default?: unknown }).default
            if (typeof handler !== 'function') {
              res.statusCode = 404
              res.setHeader('content-type', 'application/json')
              res.end('{"error":"not_found"}')
              return
            }
            await (handler as (q: typeof req, s: typeof res) => Promise<void>)(req, res)
          } catch {
            if (!res.headersSent) {
              res.statusCode = 404
              res.setHeader('content-type', 'application/json')
            }
            res.end('{"error":"not_found"}')
          }
        })()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vercelSecurityHeaders(),
    devApiRoutes(),
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
        //
        // The prerendered marketing pages are NOT in here, and nothing had to be
        // changed for that: this manifest is computed during `vite build`, and
        // scripts/prerender.mjs writes those files afterwards. Verified against
        // the built sw.js, which lists index.html and nothing else. It is the
        // outcome we want anyway (they are content, served by the NetworkFirst
        // navigation rule below), so it is recorded here rather than relied on
        // silently, because reordering the build would change it.
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
