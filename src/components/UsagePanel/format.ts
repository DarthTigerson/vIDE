export function formatResetTime(ts: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  )
}

export function formatCountdown(ts: number | null, now = Date.now()): string {
  if (!ts) return '—'
  const diff = ts - now
  if (diff <= 0) return 'now'
  const totalMin = Math.floor(diff / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatCountdownClock(ts: number | null, now = Date.now()): string {
  if (!ts) return '—'
  const diff = ts - now
  if (diff <= 0) return '00:00:00'
  const totalSec = Math.floor(diff / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function formatBurnRate(ratePerHour: number | null): string {
  return ratePerHour == null ? '—' : `≈${ratePerHour.toFixed(2)}%/hr`
}

export function formatSpend(usd: number | null): string {
  return usd == null ? '—' : `$${usd.toFixed(2)}`
}

export function formatSpendRate(usdPerHour: number | null): string {
  return usdPerHour == null ? '—' : `≈$${usdPerHour.toFixed(2)}/hr`
}
