/**
 * After a redeploy, a long-open tab can hold references to hashed build chunks
 * that no longer exist on the server. If a dynamic import / module preload then
 * fails (404), do ONE hard reload to pull the fresh build instead of dead-ending
 * the user. Guarded against reload loops (won't reload again within a short
 * window), so a genuinely broken build can't trap the tab in a refresh cycle.
 *
 * NOTE: there is no service worker in this app, so there is no precached shell to
 * go stale — the server-side SPA rewrite (vercel.json) is the navigation
 * fallback. This is purely belt-and-suspenders for failed chunk fetches.
 */

const RELOAD_TS_KEY = 'todonado:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 10_000

/** Does this error look like a failed chunk / dynamic-import / module-preload load? */
export function isChunkLoadError(reason: unknown): boolean {
  const msg =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : ''
  if (!msg) return false
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|dynamically imported module|chunkloaderror|loading chunk \d+ failed|loading css chunk|failed to load module script/i.test(
    msg,
  )
}

function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || 0)
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return // just reloaded — likely a real break, stop
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()))
  } catch {
    // sessionStorage unavailable (private mode): fall through and reload once.
  }
  window.location.reload()
}

/** Wire up chunk-load-error recovery. Call once at app start. */
export function installChunkReloadRecovery(): void {
  // Vite's first-class signal for a failed lazy/preload import.
  window.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault()
    reloadOnce()
  })
  // Catch-alls for chunk errors surfacing as runtime errors / rejected promises.
  window.addEventListener('error', (e: ErrorEvent) => {
    if (isChunkLoadError(e.message) || isChunkLoadError(e.error)) reloadOnce()
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    if (isChunkLoadError(e.reason)) reloadOnce()
  })
}
