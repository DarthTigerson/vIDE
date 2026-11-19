// The public `vide` API handed to a store app's renderer.js activate().
// Standalone on purpose: it imports only types from 'react' so it can be
// copied verbatim into an app repo as vide.d.ts.
import type { ComponentType } from 'react'

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export interface Disposable { dispose(): void }

export interface PaletteStep {
  placeholder: string
  emptyText: string
  items: { id: string; label: string; description?: string }[]
  onPick: (id: string) => void
}

export type CommandSpec = {
  id: string
  label: string
  description?: string
  keywords?: string[]
  disabledReason?: () => string | undefined
  danger?: boolean
} & ({ action: () => void } | { pick: () => PaletteStep | Promise<PaletteStep> })

// (vIDE 0.3.7+) One usage window (the 5-hour session or the week) as the
// usage panel shows it. Percentages are 0–100; times are epoch ms.
export interface UsageWindow {
  label: string
  pct: number | null
  resetAt: number | null
  ratePerHour: number | null
  cutoffAt: number | null
  windowHours: number
}

// Where a window is heading: time elapsed, usage projected at reset, and the
// verdict the panel's pace chip shows.
export interface UsagePace {
  elapsedPct: number | null
  projectedPct: number | null
  status: 'under' | 'ahead' | 'runs-out' | null
}

// What a usage view component receives; `now` ticks every second.
export interface UsageViewProps {
  session: UsageWindow
  week: UsageWindow
  now: number
}

export interface VideRendererApi {
  apiVersion: 1
  appId: string
  react: typeof import('react')
  reactDom: typeof import('react-dom')
  jsxRuntime: typeof import('react/jsx-runtime')
  ui: {
    registerSidebarPanel(p: {
      title: string
      icon: ComponentType
      component: ComponentType
      requiresProject?: boolean
    }): Disposable & { setBadge(badge?: number | string): void }
    registerSettingsPage(p: { title: string; component: ComponentType }): Disposable
    registerTabKind(
      kind: string,
      p: { title: (params: Json) => string; component: ComponentType<{ params: Json }> },
    ): Disposable
    openTab(kind: string, params: Json): void
    openPanel(): void
    openSettings(): void
    // (vIDE 0.3.7+) An activity-bar button that runs onClick instead of opening
    // a panel. One per app; listed in All Apps and favoritable as `app:<appId>`.
    registerLauncher(p: {
      title: string
      icon: ComponentType
      onClick: () => void
      visible?: boolean
      active?: boolean
    }): Disposable & { update(p: Partial<{ title: string; icon: ComponentType; visible: boolean; active: boolean }>): void }
    // (vIDE 0.3.7+) Closes the left side panel.
    closeSidePanel(): void
    // `vapp-<appId>`: every panel, settings page and tab the app renders sits
    // under an element with this class. Scope the app's CSS to it, and wrap
    // anything portalled to document.body in an element with it.
    scopeClass: string
    // vIDE's own components, re-exported as-is (props are vIDE's).
    components: {
      pillButtonClass: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Switch: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      FeatureBlock: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      SettingRow: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      PreviewFrame: ComponentType<any>
      // Clamp a popup's top-left so a width x height box stays on screen.
      clampToViewport(x: number, y: number, width: number, height: number, margin?: number): { x: number; y: number }
      // Hide native web views (browser tabs) while an overlay is open.
      useCoverNativeViews(active?: boolean): void
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Toggle: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Select: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Modal: ComponentType<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ConfirmActionModal: ComponentType<any>
    }
  }
  terminal: {
    // Read-only xterm. `start` runs on mount (and when streamKey changes) and
    // returns its stop function. `placeholder` shows until the first chunk.
    View: ComponentType<{
      start: (write: (chunk: string) => void) => () => void
      streamKey?: string
      zoomKey?: string
      placeholder?: string
      className?: string
    }>
  }
  commands: { register(c: CommandSpec): Disposable }
  notifications: {
    push(n: { id: string; text: string; onClick?: () => void }): Disposable
    peek(text: string): void
  }
  settings: {
    get(key: string): string | null
    set(key: string, value: string | null): void
    subscribe(key: string, cb: (value: string | null) => void): () => void
  }
  project: { root(): string | null; subscribe(cb: (root: string | null) => void): () => void }
  // (vIDE 0.3.7+) In-app browser tabs owned by this app. `id` matches /^[a-z0-9-]+$/.
  browser: {
    // Opens (or focuses) the app's browser tab `id` at `url`.
    open(id: string, url: string): void
    // The id of the active tab if it is one of this app's browser tabs, else null.
    activeId(): string | null
    // Fires when the active tab changes.
    subscribe(cb: () => void): () => void
  }
  // (vIDE 0.3.7+) Looks for the usage panel. A view only draws: vIDE passes
  // it the live data. Users pick it from the panel's right-click View menu.
  usage: {
    // One per app.
    registerView(p: { title: string; component: ComponentType<UsageViewProps> }): Disposable
    // The panel's own pace math, so every view agrees with the Bars chip.
    pace(w: UsageWindow, now: number): UsagePace
  }
  // (vIDE 0.3.7+) The Git panel's repos.
  git: {
    // The repo the user is working in (the Git panel's rule); null when none
    // is picked yet in a multi-repo project.
    activeRepo(): string | null
    repoCount(): number
    // Fires when the active repo or the repo list changes.
    subscribe(cb: () => void): () => void
    // Opens the repo picker.
    pickRepo(): void
  }
  app: {
    call<T = Json>(method: string, payload?: Json): Promise<T>
    on(event: string, cb: (payload: Json) => void): () => void
  }
}

export interface RendererAppModule {
  activate(vide: VideRendererApi): void | Promise<void>
  deactivate?(): void
}
