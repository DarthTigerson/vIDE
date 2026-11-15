import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import type { AppInfo } from '../../electron/apps/appTypes'
import { useAppContribStore } from './appContribStore'
import { createVideApi } from './createVideApi'
import type { RendererAppModule } from './videApiTypes'

interface Deps {
  api?: Window['api']
  importFn?: (url: string) => Promise<RendererAppModule>
  activateTimeoutMs?: number
}

const ACTIVATE_TIMEOUT_MS = 10_000

interface Entry { version: string; url: string; module: RendererAppModule | null; disposers: Array<() => void> }

const entries = new Map<string, Entry>()
let started: Promise<void> | null = null

// Test hook: forget loaded apps and the double-start guard.
export function resetAppRuntimeForTests(): void {
  entries.clear()
  started = null
}

function versionedUrl(app: AppInfo): string {
  // Main already versions the URL (dev loads add a reload counter); keep it.
  if (app.rendererUrl.includes('?')) return app.rendererUrl
  return `${app.rendererUrl}?v=${encodeURIComponent(app.version)}`
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// An app's stylesheet lives in <head> exactly while the app is active.
function addStyle(app: AppInfo): void {
  removeStyle(app.id)
  if (!app.styleUrl || typeof document === 'undefined') return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = app.styleUrl
  link.dataset.videApp = app.id
  document.head.appendChild(link)
}

function removeStyle(appId: string): void {
  if (typeof document === 'undefined') return
  document.head.querySelectorAll(`link[data-vide-app="${CSS.escape(appId)}"]`).forEach((el) => el.remove())
}

function teardown(appId: string): void {
  const entry = entries.get(appId)
  entries.delete(appId)
  removeStyle(appId)
  for (const off of entry?.disposers ?? []) { try { off() } catch { /* ignore */ } }
  try { entry?.module?.deactivate?.() } catch { /* an app's cleanup must not break the sync */ }
  useAppContribStore.getState().clearApp(appId)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('activate did not finish within 10s')), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

async function sync(
  api: Window['api'],
  importFn: (url: string) => Promise<RendererAppModule>,
  activateTimeoutMs: number,
): Promise<void> {
  const apps = await api.appsList()
  const store = useAppContribStore.getState()
  store.setApps(apps)

  // Failed apps are skipped here: they retry on the next version change or restart.
  const wanted = new Map(apps.filter((a) => a.status === 'loaded').map((a) => [a.id, a]))
  const byId = new Map(apps.map((a) => [a.id, a]))
  for (const [id, entry] of [...entries]) {
    const info = byId.get(id)
    // restart-required: its main half still runs until restart, so an app
    // already live in the renderer is left exactly as it is.
    if (info?.status === 'restart-required') continue
    const app = wanted.get(id)
    if (!app || app.version !== entry.version || app.rendererUrl !== entry.url) teardown(id)
  }

  for (const app of wanted.values()) {
    if (entries.has(app.id)) continue
    const entry: Entry = { version: app.version, url: app.rendererUrl, module: null, disposers: [] }
    entries.set(app.id, entry)
    addStyle(app)
    try {
      const mod = await importFn(versionedUrl(app))
      entry.module = mod
      await withTimeout(Promise.resolve(mod.activate(createVideApi(app, entry.disposers))), activateTimeoutMs)
    } catch (e) {
      // Drop whatever a half-activated app registered, then record why.
      for (const off of entry.disposers) { try { off() } catch { /* ignore */ } }
      try { entry.module?.deactivate?.() } catch { /* ignore */ }
      useAppContribStore.getState().clearApp(app.id)
      removeStyle(app.id)
      useAppContribStore.getState().setRuntimeError(app.id, errorMessage(e))
    }
  }
}

// Lists installed apps, imports each loaded app's renderer.js and calls
// activate, then re-syncs whenever the app list changes. Safe to call twice.
export function startAppRuntime(deps: Deps = {}): Promise<void> {
  if (started) return started
  const api = deps.api ?? window.api
  const importFn = deps.importFn ?? ((url: string) => import(/* @vite-ignore */ url) as Promise<RendererAppModule>)
  ;(globalThis as { __videShared?: unknown }).__videShared = { react: React, reactDom: ReactDOM, jsxRuntime }

  let queue: Promise<void> = Promise.resolve()
  const run = () => {
    queue = queue.then(() => sync(api, importFn, deps.activateTimeoutMs ?? ACTIVATE_TIMEOUT_MS)).catch(() => { /* a failed list leaves the previous state */ })
    return queue
  }
  api.onAppsChanged(() => { void run() })
  started = run()
  return started
}
