import './lib/migrateStorageKeys'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'
import './index.css'
import { SyncSplash, swapHoldMs } from './components/BootSplash/SyncSplash'
import { DEFAULT_SPLASH_PALETTE, loadSplashPalette } from './lib/splashPalette'
import { installCloseMenusOnRightClick } from './lib/closeMenusOnRightClick'

if (import.meta.env.VITE_MOBILE_CLIENT === 'true') {
  const { createMobileApi } = await import('./lib/mobileApiShim/createMobileApi')
  ;(window as unknown as { api: unknown }).api = createMobileApi(
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/relay`
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

// After the pull, so a value synced in from another machine is carried too.
const { migrateGitRemoteSettings } = await import('./lib/gitpageMigration')
const { migrateUsageView } = await import('./lib/usageViewMigration')
try { migrateGitRemoteSettings(localStorage); migrateUsageView(localStorage) } catch { /* storage unavailable */ }

// A release marked critical was seen during an earlier session: block the app
// until it's installed (src/lib/updateSeverity.ts). Mobile has no install.
const { requiredUpdateVersion } = await import('./lib/updateSeverity')
const requiredVersion =
  import.meta.env.VITE_MOBILE_CLIENT !== 'true' && typeof __APP_VERSION__ === 'string'
    ? requiredUpdateVersion(__APP_VERSION__)
    : null

if (requiredVersion) {
  const { SyncIncompatibleWall } = await import('./components/BootSplash/SyncIncompatibleWall')
  root.render(
    <React.StrictMode>
      <SyncIncompatibleWall reason="critical" requiredVersion={requiredVersion} />
    </React.StrictMode>
  )
} else if (preMountSyncResult.incompatible) {
  // Config came from a newer vIDE. Show only the update wall — App never mounts,
  // so every panel stays closed and there's nothing to dismiss (VIDE-162).
  const { SyncIncompatibleWall } = await import('./components/BootSplash/SyncIncompatibleWall')
  root.render(
    <React.StrictMode>
      <SyncIncompatibleWall />
    </React.StrictMode>
  )
} else {
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

  // Cache total RAM before App mounts so synchronous low-RAM checks (e.g. the
  // Chat spawn gate) don't race an async fetch on launch (VIDE-163).
  try {
    const { setCachedTotalBytes } = await import('./lib/lowRam')
    const mem = await window.api.getSystemMemoryUsage()
    setCachedTotalBytes(mem.totalBytes)
  } catch { /* fetch failed — treated as not low RAM */ }

  // Dynamic import — stores initialize NOW with the already-updated localStorage.
  const { default: App } = await import('./App')
  // A right-click anywhere closes open popup menus, like a left-click does.
  installCloseMenusOnRightClick()

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )

  // Store apps: import each installed app's renderer half once App is mounted.
  if (import.meta.env.VITE_MOBILE_CLIENT !== 'true') {
    const { startAppRuntime } = await import('./apps/appRuntime')
    void startAppRuntime()
    // Ask now, so the dev-only palette commands are there on the first open.
    const { askDevMode } = await import('./components/Search/appCommands')
    askDevMode()
  }
}
