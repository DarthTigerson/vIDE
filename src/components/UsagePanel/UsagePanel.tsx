import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLatestUsage } from './useLatestUsage'
import { PaceBar } from './UsageStats'
import { SESSION_WINDOW_HOURS, WEEKLY_WINDOW_HOURS } from './pace'
import { CheckableMenuButton, MenuButton, MenuDivider, MenuHeading } from '@/components/ui/MenuItems'
import { useAppContribStore } from '@/apps/appContribStore'
import { AppErrorBoundary } from '@/apps/AppErrorBoundary'
import type { UsageWindow } from '@/apps/videApiTypes'
import { useEditorStore } from '@/stores/editorStore'
import { useStoreStore } from '@/stores/storeStore'
import { buildAppSettingsPath } from '@/components/Settings/paths'
import { USAGE_VIEW_KEY } from '@/lib/usageViewMigration'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// Built-in Bars, or a store app's usage view (`app:<appId>`).
export type UsageView = 'bars' | `app:${string}`

export { USAGE_VIEW_KEY }

// Which view the panel shows, picked from its right-click menu. Bars is the
// default; the choice is per machine (not synced). A saved app view that is
// not installed (yet, or any more) shows Bars without forgetting the choice.
function readView(): UsageView {
  try {
    const v = localStorage.getItem(USAGE_VIEW_KEY)
    return v?.startsWith('app:') ? (v as UsageView) : 'bars'
  } catch {
    return 'bars'
  }
}

function writeView(view: UsageView) {
  try {
    localStorage.setItem(USAGE_VIEW_KEY, view)
  } catch {
    // Storage unavailable: the choice just lasts until the panel remounts.
  }
}

export function UsagePanel() {
  const latest = useLatestUsage()
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState<UsageView>(readView)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const usageViews = useAppContribStore((s) => s.usageViews)
  const settingsPages = useAppContribStore((s) => s.settingsPages)
  useCoverNativeViews(!!menu)
  const activeAppId = view.startsWith('app:') ? view.slice(4) : null
  const appView = activeAppId ? usageViews[activeAppId] : undefined
  const shownView: UsageView = appView ? view : 'bars'

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  const openMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  const pick = (next: UsageView) => {
    setView(next)
    writeView(next)
    setMenu(null)
  }

  const openPreferences = () => {
    setMenu(null)
    if (activeAppId) useEditorStore.getState().openTab({ path: buildAppSettingsPath(activeAppId), content: '', dirty: false })
  }
  const openStore = () => {
    setMenu(null)
    useStoreStore.getState().openWithCategory('usage')
  }

  const session: UsageWindow | null = latest && {
    label: 'Session',
    pct: latest.sessionPct,
    resetAt: latest.sessionResetAt,
    ratePerHour: latest.sessionAvgRatePerHour,
    cutoffAt: latest.sessionCutoffAt,
    windowHours: SESSION_WINDOW_HOURS,
  }
  const week: UsageWindow | null = latest && {
    label: 'Week',
    pct: latest.weeklyPct,
    resetAt: latest.weeklyResetAt,
    ratePerHour: latest.weeklyAvgRatePerHour,
    cutoffAt: latest.weeklyCutoffAt,
    windowHours: WEEKLY_WINDOW_HOURS,
  }

  return (
    <div
      data-testid="usage-panel"
      data-view={shownView}
      className="shrink-0 border-t border-border bg-sidebar px-4 py-3"
      onContextMenu={openMenu}
    >
      {session && week ? (
        appView ? (
          <AppErrorBoundary appId={appView.appId} title={appView.title}>
            <appView.component session={session} week={week} now={now} />
          </AppErrorBoundary>
        ) : (
          <div className="flex flex-col gap-4">
            <PaceBar {...session} now={now} />
            <PaceBar {...week} now={now} />
          </div>
        )
      ) : (
        <p className="text-xs text-fg-muted text-center py-4">No usage data yet</p>
      )}

      {menu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[200] w-36 rounded-sm border border-border bg-popover p-1 shadow-2xl shadow-black/50"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuHeading>View</MenuHeading>
          <CheckableMenuButton checked={shownView === 'bars'} onClick={() => pick('bars')}>Bars</CheckableMenuButton>
          {Object.values(usageViews).map((v) => (
            <CheckableMenuButton key={v.appId} checked={shownView === `app:${v.appId}`} onClick={() => pick(`app:${v.appId}`)}>{v.title}</CheckableMenuButton>
          ))}
          <MenuDivider />
          {appView && settingsPages[appView.appId] && <MenuButton onClick={openPreferences}>Preferences…</MenuButton>}
          <MenuButton onClick={openStore}>Store…</MenuButton>
        </div>,
        document.body,
      )}
    </div>
  )
}
