import { useLayoutEffect, useRef, useState } from 'react'

export type SubmenuSide = 'left' | 'right'

interface Rect { top: number; left: number; right: number }
interface Size { width: number; height: number }

// Where a submenu flies out next to its trigger row so it stays on screen:
// the preferred side when it fits, else the other side, else whichever side
// has more room. Vertically it starts level with the row and moves up just
// enough to clear the bottom edge (never above the top edge).
export function placeSubmenu(
  trigger: Rect,
  panel: Size,
  viewport: Size,
  prefer: SubmenuSide = 'right',
  margin = 4,
): { side: SubmenuSide; offsetY: number } {
  const roomRight = viewport.width - margin - trigger.right
  const roomLeft = trigger.left - margin
  const fits = (side: SubmenuSide) => (side === 'right' ? roomRight : roomLeft) >= panel.width
  const other: SubmenuSide = prefer === 'right' ? 'left' : 'right'
  const side = fits(prefer) ? prefer : fits(other) ? other : roomRight >= roomLeft ? 'right' : 'left'

  const overflowBottom = trigger.top + panel.height - (viewport.height - margin)
  let offsetY = overflowBottom > 0 ? -overflowBottom : 0
  offsetY = Math.max(offsetY, margin - trigger.top)
  return { side, offsetY }
}

// The flyout panel of a hover submenu. Must be the direct child of the
// trigger row's `relative` wrapper: it measures that wrapper to place itself.
export function SubmenuPanel({ prefer = 'right', className = '', children }: {
  prefer?: SubmenuSide
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ side: SubmenuSide; offsetY: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const trigger = el?.parentElement
    if (!el || !trigger) return
    setPlace(placeSubmenu(
      trigger.getBoundingClientRect(),
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      prefer,
    ))
  }, [prefer])

  const side = place?.side ?? prefer
  return (
    <div
      ref={ref}
      className={`absolute ${side === 'left' ? 'right-full' : 'left-full'} z-10 ${className}`}
      // Hidden until measured; useLayoutEffect runs before paint, so the
      // unplaced first render never shows.
      style={{ top: place?.offsetY ?? 0, visibility: place ? undefined : 'hidden' }}
    >
      {children}
    </div>
  )
}
