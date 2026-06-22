import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { installChunkReloadRecovery } from '@/lib/chunkRecovery'
import '@/index.css'

// Recover a stale tab after a redeploy: a failed chunk fetch triggers one reload.
installChunkReloadRecovery()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
