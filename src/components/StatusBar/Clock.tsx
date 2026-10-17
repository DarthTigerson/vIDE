import { useEffect, useState } from 'react'
import { useAlarmStore } from '@/stores/alarmStore'
import { useEditorStore } from '@/stores/editorStore'
import { nextAlarm, formatTimeUntil } from '@/lib/alarmSchedule'
import { ALARMS_TAB_PATH } from '@/components/Settings/paths'
import { AlarmIcon } from '@/components/Alarms/AlarmIcon'
import { AlarmPopup } from '@/components/Alarms/AlarmPopup'
import { footerPopupShadow } from '@/components/ui/footerPopup'

// Lives in the footer's far-right corner at every window width (VIDE-140) —
// full text colour rather than fg-subtle, which read at ~2.7:1 and was hard
// to see at a glance. text-sm with leading-none: one step larger than the
// rest of the footer while still fitting its fixed h-6 height.
// Clicking it opens the Alarms tab (VIDE-141); a small alarm icon shows
// while any alarm is on, and the ringing alarm's popup anchors here.
export function Clock() {
  const [now, setNow] = useState(() => new Date())
  const alarms = useAlarmStore((s) => s.alarms)
  const ringing = useAlarmStore((s) => s.ringing)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const next = nextAlarm(alarms, now.getTime())

  return (
    // h-5 like the bell's wrapper, so the hover panel below can use the same
    // offset as the notification peek to sit on the footer's top edge.
    <span className="group relative flex h-5 items-center">
      <button
        type="button"
        data-testid="footer-clock-button"
        onClick={() => useEditorStore.getState().openTab({ path: ALARMS_TAB_PATH, content: '', dirty: false })}
        aria-label="Open alarms"
        className={[
          'flex h-5 items-center gap-1.5 rounded px-0.5 transition-colors hover:bg-white/5',
          ringing ? 'text-accent' : 'text-fg',
        ].join(' ')}
      >
        {(next || ringing) && (
          <span data-testid="footer-clock-alarm" className={['flex [&_svg]:h-3 [&_svg]:w-3', ringing ? 'text-accent' : 'text-fg-muted'].join(' ')}>
            <AlarmIcon />
          </span>
        )}
        <span data-testid="footer-clock" className="shrink-0 text-sm leading-none font-medium select-none tabular-nums">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      </button>
      {/* Styled like NotificationPeek: popover panel on the footer's top edge.
          Hidden while an alarm rings — its popup takes this spot. */}
      {!ringing && (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute bottom-full -right-3 z-40 mb-[3px] flex flex-col gap-1 whitespace-nowrap',
            'rounded-t border border-b-0 border-border bg-popover px-3 py-1.5 text-xs text-fg',
            footerPopupShadow,
            'opacity-0 translate-y-1 transition-[opacity,transform] duration-200 ease-out delay-150',
            'group-hover:opacity-100 group-hover:translate-y-0',
          ].join(' ')}
        >
          <span className="flex items-center gap-2">
            <span className="shrink-0 text-accent [&_svg]:h-3.5 [&_svg]:w-3.5">
              <CalendarIcon />
            </span>
            {formatLongDate(now)}
          </span>
          {/* The next alarm, e.g. "Break at 10:06 PM · in 8 min". */}
          {next && (
            <span data-testid="footer-clock-next-alarm" className="flex items-center gap-2">
              <span className="shrink-0 text-accent [&_svg]:h-3.5 [&_svg]:w-3.5">
                <AlarmIcon />
              </span>
              <span>
                <span className="font-semibold">{next.alarm.name}</span> at{' '}
                {new Date(next.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                <span className="text-fg-muted"> · {formatTimeUntil(next.at, now.getTime())}</span>
              </span>
            </span>
          )}
        </span>
      )}
      <AlarmPopup />
    </span>
  )
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// "Wednesday the 8th of October"
export function formatLongDate(date: Date): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = date.toLocaleDateString('en-GB', { month: 'long' })
  return `${weekday} the ${ordinal(date.getDate())} of ${month}`
}

function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'
  return `${day}${suffix}`
}
