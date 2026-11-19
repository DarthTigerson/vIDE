import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import type { AppInfo } from '../../electron/apps/appTypes'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { usePeekEventStore } from '@/stores/peekEventStore'
import { notifySettingChanged } from '@/lib/notifySettingChanged'
import { buildAppTabPath, buildAppSettingsPath, buildBrowserPath } from '@/components/Settings/paths'
import { useBrowserStore } from '@/stores/browserStore'
import { useGitReposStore, getActiveRepo } from '@/stores/gitReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useSearchStore } from '@/stores/searchStore'
import { pillButtonClass } from '@/components/ui/pillButton'
import { Toggle, Switch } from '@/components/ui/Toggle'
import { FeatureBlock, SettingRow } from '@/components/Settings/FeatureBlock'
import { PreviewFrame } from '@/components/Settings/previews/primitives'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import type { Command } from '@/components/Search/commands'
import { useAppContribStore } from './appContribStore'
import { StreamTerminal, type StreamTerminalProps } from './StreamTerminal'
import type { Json, VideRendererApi } from './videApiTypes'

const settingListeners = new Map<string, Set<(v: string | null) => void>>()

function openAppTab(path: string) {
  useEditorStore.getState().openTab({ path, content: '', dirty: false })
}

// Builds the `vide` object one app receives. Everything an app registers is
// recorded in appContribStore under its appId so clearApp can drop it all.
// Every subscription handed out is also pushed onto `disposers` (when given)
// so the runtime can remove them all when the app is torn down.
// The class every app-rendered tree sits under; an app's stylesheet is
// scoped to it so it can never restyle vIDE.
export function appScopeClass(appId: string): string {
  return `vapp-${appId}`
}

export function createVideApi(app: Pick<AppInfo, 'id' | 'name'>, disposers: Array<() => void> = []): VideRendererApi {
  const appId = app.id
  const track = (off: () => void): (() => void) => {
    let done = false
    const once = () => { if (!done) { done = true; off() } }
    disposers.push(once)
    return once
  }
  const store = () => useAppContribStore.getState()
  const settingKey = (key: string) => `vide:${appId}:${key}`
  // Browser tab ids are namespaced per app: `app-<appId>-<id>`.
  const browserPrefix = `app-${appId}-`

  return {
    apiVersion: 1,
    appId,
    react: React,
    reactDom: ReactDOM,
    jsxRuntime,
    ui: {
      registerSidebarPanel(p) {
        store().registerPanel({
          appId, title: p.title, icon: p.icon, component: p.component, requiresProject: p.requiresProject ?? false,
        })
        return {
          dispose: () => store().unregisterPanel(appId),
          setBadge: (badge) => store().setPanelBadge(appId, badge),
        }
      },
      registerSettingsPage(p) {
        store().registerSettingsPage({ appId, title: p.title, component: p.component })
        return { dispose: () => store().unregisterSettingsPage(appId) }
      },
      registerTabKind(kind, p) {
        if (!/^[a-z0-9-]+$/.test(kind)) throw new Error('bad tab kind')
        store().registerTabKind({ appId, kind, title: p.title, component: p.component })
        return { dispose: () => store().unregisterTabKind(appId, kind) }
      },
      openTab: (kind, params) => openAppTab(buildAppTabPath(appId, kind, params)),
      openPanel: () => store().requestPanel(appId),
      openSettings: () => openAppTab(buildAppSettingsPath(appId)),
      registerLauncher(p) {
        store().registerLauncher({
          appId, title: p.title, icon: p.icon, onClick: p.onClick, visible: p.visible ?? true, active: p.active ?? false,
        })
        return {
          dispose: () => store().unregisterLauncher(appId),
          update: (patch) => store().updateLauncher(appId, patch),
        }
      },
      closeSidePanel: () => store().requestSidePanelClose(),
      scopeClass: appScopeClass(appId),
      components: {
        pillButtonClass, Toggle, Switch, Select, Modal, ConfirmActionModal,
        FeatureBlock, SettingRow, PreviewFrame, clampToViewport, useCoverNativeViews,
      },
    },
    terminal: {
      // Zoom keys are namespaced so two apps never share a font-size override.
      View: (props: StreamTerminalProps) => React.createElement(StreamTerminal, {
        ...props,
        zoomKey: `app:${appId}:${props.zoomKey ?? 'terminal'}`,
      }),
    },
    commands: {
      register(c) {
        const id = `app:${appId}:${c.id}`
        const { disabledReason, ...rest } = c
        const command = {
          ...rest,
          id,
          label: `${app.name}: ${c.label}`,
          ...(disabledReason ? { disabledReason: () => disabledReason() ?? null } : {}),
        } as Command
        store().registerCommand({ appId, command })
        return { dispose: () => store().unregisterCommand(id) }
      },
    },
    notifications: {
      push(n) {
        store().registerNotification({ appId, id: n.id, text: n.text, onClick: n.onClick })
        return { dispose: () => store().unregisterNotification(appId, n.id) }
      },
      peek: (text) => usePeekEventStore.getState().show(text, 'info'),
    },
    settings: {
      get(key) {
        try { return localStorage.getItem(settingKey(key)) } catch { return null }
      },
      set(key, value) {
        const k = settingKey(key)
        try {
          if (value === null) localStorage.removeItem(k)
          else localStorage.setItem(k, value)
        } catch { return } // storage unavailable: nothing changed, nothing to announce
        notifySettingChanged()
        settingListeners.get(k)?.forEach((cb) => cb(value))
      },
      subscribe(key, cb) {
        const k = settingKey(key)
        let set = settingListeners.get(k)
        if (!set) { set = new Set(); settingListeners.set(k, set) }
        set.add(cb)
        return track(() => { set!.delete(cb) })
      },
    },
    project: {
      root: () => useFileStore.getState().projectRoot,
      subscribe: (cb) =>
        track(useFileStore.subscribe((s, prev) => {
          if (s.projectRoot !== prev.projectRoot) cb(s.projectRoot)
        })),
    },
    browser: {
      open(id, url) {
        if (!/^[a-z0-9-]+$/.test(id)) throw new Error('bad browser id')
        const fullId = `${browserPrefix}${id}`
        // Seed the url before the tab (and so BrowserTab) mounts.
        useBrowserStore.getState().ensureTab(fullId, url)
        openAppTab(buildBrowserPath(fullId))
      },
      activeId: () => {
        const path = useEditorStore.getState().activeTabPath
        const prefix = buildBrowserPath(browserPrefix)
        return path && path.startsWith(prefix) ? path.slice(prefix.length) : null
      },
      subscribe: (cb) =>
        track(useEditorStore.subscribe((s, prev) => {
          if (s.activeTabPath !== prev.activeTabPath) cb()
        })),
    },
    git: {
      activeRepo: getActiveRepo,
      repoCount: () => useGitReposStore.getState().repos.length,
      subscribe: (cb) => {
        let last = `${getActiveRepo()}|${useGitReposStore.getState().repos.length}`
        const check = () => {
          const next = `${getActiveRepo()}|${useGitReposStore.getState().repos.length}`
          if (next !== last) { last = next; cb() }
        }
        const offRepos = useGitReposStore.subscribe(check)
        const offOpen = useGitOpenReposStore.subscribe(check)
        return track(() => { offRepos(); offOpen() })
      },
      pickRepo: () => useSearchStore.getState().openRepoPalette(),
    },
    app: {
      call: (method, payload) => window.api.appsCall(appId, method, payload) as Promise<never>,
      on: (event, cb) =>
        track(window.api.onAppsEvent((id, ev, payload) => {
          if (id === appId && ev === event) cb(payload as Json)
        })),
    },
  }
}
