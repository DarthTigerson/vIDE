import { useEffect, useState } from 'react'

type BatteryStatus = NonNullable<Awaited<ReturnType<Window['api']['getBatteryStatus']>>>

const BATTERY_POLL_INTERVAL_MS = 30000
const LOW_PERCENT = 20

function powerLabel(status: BatteryStatus): string {
  if (status.charging) return 'Charging'
  return status.pluggedIn ? 'Plugged in' : 'On battery'
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

// Title bar battery, beside the memory pill: icon + percentage, details on
// hover (same popover as the memory pill). Renders nothing on a machine
// without a battery, and nothing until the first reading arrives.
// withDivider: a thin rule before it, when something (the memory pill) sits to its left.
export function BatteryPill({ withDivider = false }: { withDivider?: boolean }) {
  const [status, setStatus] = useState<BatteryStatus | null>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== 'visible') return
      window.api.getBatteryStatus().then(setStatus).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, BATTERY_POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [])

  if (!status) return null
  const low = status.percent <= LOW_PERCENT && !status.charging

  return (
    <>
      {withDivider && <span aria-hidden="true" className="h-3.5 w-px bg-border" />}
      <span
        data-testid="battery-pill"
        className={[
          'relative flex items-center gap-1 text-xs font-medium tabular-nums',
          low ? 'text-red-400' : 'text-fg-muted',
        ].join(' ')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <BatteryIcon percent={status.percent} charging={status.charging} low={low} />
        {status.percent}%
        {hovered && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-48 rounded-md border border-border bg-popover p-2.5 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">Battery</span>
              <span className="font-medium text-fg tabular-nums">{status.percent}%</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-fg-muted">Power</span>
              <span className="font-medium text-fg">{powerLabel(status)}</span>
            </div>
            {status.minutesLeft != null && (
              <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-fg-muted">Time left</span>
                <span className="font-medium text-fg tabular-nums">{formatMinutes(status.minutesLeft)}</span>
              </div>
            )}
          </div>
        )}
      </span>
    </>
  )
}

function BatteryIcon({ percent, charging, low }: { percent: number; charging: boolean; low: boolean }) {
  const fillWidth = Math.max(1, (14 * Math.min(100, Math.max(0, percent))) / 100)
  return (
    <svg className="shrink-0" width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden="true">
      <rect x="0.75" y="1.75" width="17.5" height="8.5" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="19.2" y="4.25" width="1.8" height="3.5" rx="0.9" fill="currentColor" />
      <rect
        x="2.5"
        y="3.5"
        width={fillWidth}
        height="5"
        rx="1"
        className={charging ? 'fill-accent' : low ? 'fill-red-400' : 'fill-current'}
      />
      {charging && (
        <path
          d="M10.3 2.3L7 6.6H9.3L8.4 9.7L11.7 5.4H9.4L10.3 2.3Z"
          className="fill-fg stroke-tab-bar"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
