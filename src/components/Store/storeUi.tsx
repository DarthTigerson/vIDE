// Small pieces shared by the Store tab and the per-app Store page.

export function AppMonogram({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'w-16 h-16 rounded-2xl text-[1.375rem]' : 'w-10 h-10 rounded-[9px] text-sm'
  return (
    <div aria-hidden="true" className={`${box} shrink-0 flex items-center justify-center font-bold bg-accent/15 text-accent`}>
      {name.slice(0, 2)}
    </div>
  )
}

export function MadeByVide({ suffix }: { suffix?: string }) {
  return (
    <span className="flex items-center gap-1 text-[0.6875rem] text-fg-subtle min-w-0">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="text-accent shrink-0">
        <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="truncate">Made by vIDE{suffix ? ` · ${suffix}` : ''}</span>
    </span>
  )
}

// "just now", "5 min ago", "3 h ago", "2 days ago".
export function formatCheckedAgo(checkedAt: number, now = Date.now()): string {
  const mins = Math.floor((now - checkedAt) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

export const ghostPillClass =
  'h-7 px-3.5 rounded-full text-[0.6875rem] font-bold border border-border text-fg-muted hover:text-fg hover:bg-white/5 transition-colors'
