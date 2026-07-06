import { registerSW } from 'virtual:pwa-register'
import { notifyToast } from '@/components/common/toastBridge'

/**
 * Register the service worker (auto-update). When a new version is ready, show an
 * unobtrusive toast with a Reload action instead of silently reloading mid-session
 * — reuses the app's toast system via the bridge. The SW itself uses network-first
 * navigation and never caches /api or Supabase (see vite.config.ts); the existing
 * chunkRecovery stays as the belt-and-suspenders fallback for a stale chunk fetch.
 */
export function registerPwa(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      notifyToast('Todonado just updated.', {
        action: { label: 'Reload', onClick: () => void updateSW(true) },
      })
    },
    // onOfflineReady: intentionally silent — the app simply works offline now.
  })
}
