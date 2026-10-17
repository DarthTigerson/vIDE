import type { ReactNode } from 'react'
import { footerPopupShadow } from '@/components/ui/footerPopup'

// Hover label for the footer's right-hand icons, styled like the clock's
// date panel (Clock.tsx): a popover tab rising from the footer's top edge
// after a short delay. The wrapper is h-5 like the clock's, so mb-[3px]
// lands the panel exactly on that edge. Named group (group/tip) so an
// enclosing `group` elsewhere can't trigger it. `hidden` suppresses it while
// the icon's own menu or panel occupies the same spot.
export function FooterTooltip({ label, hidden, children }: { label: string; hidden?: boolean; children: ReactNode }) {
  return (
    <span className="group/tip relative flex h-5 items-center">
      {children}
      {!hidden && (
        <span
          role="tooltip"
          className={[
            'pointer-events-none absolute bottom-full left-1/2 z-40 mb-[3px] -translate-x-1/2 whitespace-nowrap',
            'rounded-t border border-b-0 border-border bg-popover px-3 py-1.5 text-xs text-fg',
            footerPopupShadow,
            'opacity-0 translate-y-1 transition-[opacity,transform] duration-200 ease-out delay-150',
            'group-hover/tip:opacity-100 group-hover/tip:translate-y-0',
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </span>
  )
}
