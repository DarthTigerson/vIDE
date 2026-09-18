import './lib/migrateStorageKeys'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

if (import.meta.env.VITE_MOBILE_CLIENT === 'true') {
  const { createMobileApi } = await import('./lib/mobileApiShim/createMobileApi')
  ;(window as unknown as { api: unknown }).api = createMobileApi(
    `ws://${window.location.host}/relay`
  )
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Show a minimal loading screen before any store initializes.
// Plain inline styles — CSS variables aren't set yet.
root.render(
  <div style={{
    height: '100vh', width: '100vw',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#141414',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }}>
    <style>{`@keyframes vide-spin { to { transform: rotate(360deg) } }`}</style>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.28)', fontSize: 13 }}>
      <svg
        style={{ animation: 'vide-spin 1s linear infinite', flexShrink: 0 }}
        width="14" height="14" viewBox="0 0 24 24" fill="none"
      >
        <path
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      Syncing settings…
    </div>
  </div>
)

// Run sync BEFORE importing App. Zustand stores read localStorage at module-load
// time (module-level constants), so they must see the synced values on first import.
const { runPreMountSync } = await import('./lib/preBootSync')
await runPreMountSync()

// Dynamic import — stores initialize NOW with the already-updated localStorage.
const { default: App } = await import('./App')

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
