import { useState } from 'react'

// Small pieces shared by the Store tab and the per-app Store page.

// The app's real icon when the catalog has one that loads, else the initials tile.
export function AppMonogram({ name, size = 'md', icon }: { name: string; size?: 'sm' | 'md' | 'lg'; icon?: string }) {
  const [broken, setBroken] = useState(false)
  const box = size === 'lg' ? 'w-16 h-16 rounded-2xl text-[1.375rem]' : size === 'sm' ? 'w-6 h-6 rounded-md text-[0.625rem]' : 'w-10 h-10 rounded-[9px] text-sm'
  if (icon && !broken) {
    return (
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        draggable={false}
        onError={() => setBroken(true)}
        className={`${box} shrink-0 object-cover`}
      />
    )
  }
  return (
    <div aria-hidden="true" className={`${box} shrink-0 flex items-center justify-center font-bold bg-accent/15 text-accent`}>
      {name.slice(0, 2)}
    </div>
  )
}

// "From file" marker for apps installed from a package that is not a Store release.
export function FromFileBadge() {
  return <span className="text-[0.625rem] font-bold px-1.5 rounded-sm bg-border text-fg-muted">From file</span>
}

// "Disabled" marker for an installed app the user switched off.
export function DisabledBadge() {
  return <span className="text-[0.625rem] font-bold px-1.5 rounded-sm bg-border text-fg-muted">Disabled</span>
}

// 15234 -> "14.9 KB".
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ISO date -> "15 Nov 2026"; null when it does not parse.
export function formatReleased(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MadeByVsuite({ suffix }: { suffix?: string }) {
  return (
    <span className="flex items-center gap-1 text-[0.6875rem] text-fg-subtle min-w-0">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="text-accent shrink-0">
        <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="truncate">Made by vSuite{suffix ? ` · ${suffix}` : ''}</span>
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

// Every Store action button (Install, Update, Uninstall, Remove, …) gets the
// same width, wide enough for "Uninstalling…", so rows line up.
export const storeActionWidth = 'min-w-[7.5rem]'

export const ghostPillClass =
  'h-7 px-3.5 rounded-full text-[0.6875rem] font-bold border border-border text-fg-muted hover:text-fg hover:bg-white/5 transition-colors'

// The vSuite Store bag, same mark as the All Apps panel's Store button.
export function StoreBagIcon({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M4 9h16l-1 11H5zM8 9V7a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
