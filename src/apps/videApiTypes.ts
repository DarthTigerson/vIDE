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
  app: {
    call<T = Json>(method: string, payload?: Json): Promise<T>
    on(event: string, cb: (payload: Json) => void): () => void
  }
}

export interface RendererAppModule {
  activate(vide: VideRendererApi): void | Promise<void>
  deactivate?(): void
}
