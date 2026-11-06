import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// Hover label for an editor tab, in vIDE's popover style rather than the
// native `title` bubble: a panel dropping from the tab bar's bottom edge,
// the mirror of FooterTooltip's tab rising from the footer. Portalled to
// <body> with fixed positioning because the tab strip scrolls horizontally
// (overflow-x-auto), which would clip an absolutely positioned child. It drops
// over the pane below, which may be a browser tab (a native view drawn above
// the DOM), so it covers native views while shown.
export function TabTooltip({ label, anchor }: { label: string; anchor: DOMRect }) {
  useCoverNativeViews()
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(anchor.left)
  const [shown, setShown] = useState(false)

  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0
    const margin = 4
    const max = window.innerWidth - width - margin
    setLeft(Math.max(margin, Math.min(anchor.left, max)))
    // Next frame, so the fade/slide transition runs from its start state.
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [anchor, label])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ left, top: anchor.bottom }}
      className={[
        'pointer-events-none fixed z-50 max-w-[480px] break-words',
        'rounded-b border border-t-0 border-border bg-popover px-3 py-1.5 text-xs text-fg',
        'shadow-[0_6px_16px_-6px_rgba(0,0,0,0.4)]',
        'transition-[opacity,transform] duration-200 ease-out',
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
      ].join(' ')}
    >
      {label}
    </div>,
    document.body,
  )
}
