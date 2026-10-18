import type { WindowBounds } from './session'

export interface Rect { x: number; y: number; width: number; height: number }

// How much of the window's top strip (where the title bar and traffic lights
// sit) must still land on some screen for its saved position to be usable.
const MIN_VISIBLE_PX = 100
const TITLE_STRIP_PX = 40

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  }
}

// Saved bounds can point at a monitor that is no longer plugged in. Keep the
// position only if the window could still be grabbed by its title bar on one
// of today's screens; otherwise drop x/y so the OS centres it, and shrink the
// size to fit the primary screen if it no longer does.
export function fitBoundsToDisplays(
  saved: WindowBounds,
  workAreas: Rect[],
): Partial<Rect> & { width: number; height: number } {
  const titleStrip: Rect = { x: saved.x, y: saved.y, width: saved.width, height: TITLE_STRIP_PX }
  const reachable = workAreas.some((area) => {
    const o = overlap(titleStrip, area)
    return o.width >= MIN_VISIBLE_PX && o.height > 0
  })
  if (reachable) return { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
  const primary = workAreas[0]
  if (!primary) return { width: saved.width, height: saved.height }
  return {
    width: Math.min(saved.width, primary.width),
    height: Math.min(saved.height, primary.height),
  }
}
