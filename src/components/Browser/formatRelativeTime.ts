const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Short, glanceable timestamps for the landing page's Recent/Closed rows
// ("2m" / "14m" / "Yesterday") — not a general-purpose formatter.
export function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 2 * DAY) return 'Yesterday'
  return `${Math.floor(diff / DAY)}d`
}
