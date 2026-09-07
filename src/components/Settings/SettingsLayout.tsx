import type { ReactNode } from 'react'

// Shared building blocks for the flat, card-free settings page layout:
// a labeled section, hairline-divided rows within it, and an inline
// label+control pair for a row's secondary fields (model pickers, inputs).

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pt-8 first:pt-0">
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">{label}</h2>
      <div className="flex flex-col divide-y divide-border/40">{children}</div>
    </section>
  )
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="py-4 pl-3 first:pt-0 last:pb-0">{children}</div>
}

export function Field({ label, htmlFor, children, className }: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <label htmlFor={htmlFor} className="text-xs text-fg-muted shrink-0 w-20">{label}</label>
      <div className={className ?? 'w-56 shrink-0'}>{children}</div>
    </div>
  )
}

// A stacked (label above, input below) single-line text field — for
// longer-label or longer-value inputs (URLs, keys) where Field's inline
// label-left layout would be too cramped.
export function TextField({ id, label, value, onChange, placeholder, className }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className ?? 'flex flex-col gap-1.5'}>
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}
