import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { installChunkReloadRecovery } from '@/lib/chunkRecovery'
import { registerPwa } from '@/pwa/registerPwa'
import '@/index.css'

// Recover a stale tab after a redeploy: a failed chunk fetch triggers one reload.
installChunkReloadRecovery()
// Register the PWA service worker (auto-update + "Updated — Reload" toast).
registerPwa()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
