import { StrictMode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { QueryClientProvider } from '@tanstack/react-query'
import { Writable } from 'node:stream'
import { queryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/components/common/ToastProvider'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { AppRoutes } from '@/routes/AppRoutes'

/*
 * Re-exported so the prerender script has ONE module to import and the route
 * table cannot drift from the tree that renders it.
 */
export { PRERENDER_ROUTES, softwareApplicationJsonLd, organizationJsonLd } from './routes'
export type { PrerenderRoute } from './routes'

/**
 * BUILD-TIME RENDER OF THE PUBLIC MARKETING ROUTES.
 *
 * ── WHY THIS IS PRERENDER AND NOT SSR ──────────────────────────────────────
 *
 * Nothing here runs at request time. `scripts/prerender.mjs` calls this once
 * per public route during `npm run build`, writes the resulting HTML to disk,
 * and Vercel then serves plain static files. There is no server to operate, no
 * new runtime dependency, no cold start, and no way for a crawler's request to
 * touch a database.
 *
 * ── AND WHY THE CLIENT STILL USES createRoot, NOT hydrateRoot ──────────────
 *
 * This is the decision that makes the whole approach low risk, so it is written
 * down rather than left to be discovered.
 *
 * `hydrateRoot` requires the server and client trees to match exactly on the
 * first render. This app cannot promise that: the hero meter, the auto-plan and
 * the week board are self-playing widgets driven by timers, the reveal
 * animations key off IntersectionObserver, and the reduced-motion branches read
 * `matchMedia`. Every one of those legitimately differs between a build machine
 * and a browser, and each difference would be a hydration mismatch — React
 * warnings in the console at best, a corrupted tree at worst.
 *
 * `createRoot` simply renders over the prerendered markup. That is a few
 * milliseconds of duplicated work on first load, and in exchange a mismatch is
 * structurally impossible. The prerendered HTML exists for crawlers and for the
 * first paint; the interactive page a human ends up with is byte-for-byte the
 * one that shipped before this change.
 *
 * ── WHAT MAKES IT SAFE TO RUN THE REAL APP TREE ────────────────────────────
 *
 * Effects never run during server rendering, and every browser API this tree
 * touches is inside one: `AuthProvider` calls `supabase.auth.getSession()` in an
 * effect, so **no network request of any kind is made while prerendering**, and
 * the marketing widgets set their timers in effects too. The tree therefore
 * renders its honest signed-out, pre-animation state.
 *
 * `renderToPipeableStream` rather than `renderToString`, because the landing
 * page code-splits nearly every section behind `React.lazy`. `renderToString`
 * would emit the Suspense fallbacks (nothing) and produce an empty page;
 * `onAllReady` waits for every lazy chunk to resolve first, which is exactly
 * what a crawler needs to see.
 */
export function renderRoute(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ''
    const sink = new Writable({
      write(chunk, _enc, cb) {
        html += chunk.toString()
        cb()
      },
    })
    sink.on('finish', () => resolve(html))

    const { pipe, abort } = renderToPipeableStream(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <StaticRouter location={url}>
                <AuthProvider>
                  <AppRoutes />
                </AuthProvider>
              </StaticRouter>
            </ToastProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>,
      {
        // Every lazy section resolved before a byte is written. Without this the
        // output is the hero and a page of empty Suspense fallbacks.
        onAllReady() {
          pipe(sink)
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        },
      },
    )

    // A hung render must fail the build rather than silently ship an empty
    // page, which is the failure mode this whole change exists to remove.
    const timer = setTimeout(() => {
      abort()
      reject(new Error(`Prerender timed out after 30s for ${url}`))
    }, 30_000)
    sink.on('finish', () => clearTimeout(timer))
  })
}
