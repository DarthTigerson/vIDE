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
