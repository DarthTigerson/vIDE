import './lib/migrateStorageKeys'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'
import './index.css'
import { SyncSplash, swapHoldMs } from './components/BootSplash/SyncSplash'
import { DEFAULT_SPLASH_PALETTE, loadSplashPalette } from './lib/splashPalette'

if (import.meta.env.VITE_MOBILE_CLIENT === 'true') {
  const { createMobileApi } = await import('./lib/mobileApiShim/createMobileApi')
  ;(window as unknown as { api: unknown }).api = createMobileApi(
    `ws://${window.location.host}/relay`
  )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Show the sync splash before any store initializes. It starts in a fixed
// default colour — no theme exists yet — and takes on the synced theme's colour
// once the pull has landed (see SyncSplash.tsx / lib/splashPalette.ts).
// flushSync so the default colours are committed before the pull can finish.
flushSync(() => root.render(<SyncSplash palette={DEFAULT_SPLASH_PALETTE} />))

// Run sync BEFORE importing App. Zustand stores read localStorage at module-load
// time (module-level constants), so they must see the synced values on first import.
const { runPreMountSync, preMountSyncResult } = await import('./lib/preBootSync')
await runPreMountSync()

// Only a successful pull swaps colours: sync off or offline goes straight to
// the app instead of pretending something synced.
if (preMountSyncResult.lastSyncAt !== null) {
  // Let the default colours paint first, or a fast pull would jump straight to
  // the synced colours with nothing to transition from. rAF never fires in a
  // hidden window, so don't wait on it forever.
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 100)
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(fallback); resolve() }))
  })
  root.render(<SyncSplash palette={loadSplashPalette()} />)
  await new Promise((resolve) => setTimeout(resolve, swapHoldMs()))
}

// Dynamic import — stores initialize NOW with the already-updated localStorage.
const { default: App } = await import('./App')

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
