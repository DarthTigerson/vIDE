import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLatestUsage } from './useLatestUsage'
import { PaceBar } from './UsageStats'
import { UsageGauges, type GaugeWindow } from './UsageGauges'
import { SESSION_WINDOW_HOURS, WEEKLY_WINDOW_HOURS } from './pace'
import { CheckableMenuButton, MenuHeading } from '@/components/ui/MenuItems'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

export type UsageView = 'gauges' | 'bars'

// Which view the panel shows, picked from its right-click menu. Gauges is the
// default; the choice is per machine (not synced).
export const USAGE_VIEW_KEY = 'vide:usagePanelView'

function readView(): UsageView {
  try {
    return localStorage.getItem(USAGE_VIEW_KEY) === 'bars' ? 'bars' : 'gauges'
  } catch {
    return 'gauges'
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
  useCoverNativeViews(!!menu)

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

  const session: GaugeWindow | null = latest && {
    label: 'Session',
    pct: latest.sessionPct,
    resetAt: latest.sessionResetAt,
    ratePerHour: latest.sessionAvgRatePerHour,
    cutoffAt: latest.sessionCutoffAt,
    windowHours: SESSION_WINDOW_HOURS,
  }
  const week: GaugeWindow | null = latest && {
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
      data-view={view}
      className="shrink-0 border-t border-border bg-sidebar px-4 py-3"
      onContextMenu={openMenu}
    >
      {session && week ? (
        view === 'gauges' ? (
          <UsageGauges session={session} week={week} now={now} />
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
          <CheckableMenuButton checked={view === 'gauges'} onClick={() => pick('gauges')}>Gauges</CheckableMenuButton>
          <CheckableMenuButton checked={view === 'bars'} onClick={() => pick('bars')}>Bars</CheckableMenuButton>
        </div>,
        document.body,
      )}
    </div>
  )
}
