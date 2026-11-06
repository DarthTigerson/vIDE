// Which bottom-terminal side (0 or 1) holds keyboard focus, or null when
// focus is elsewhere. Cmd+W arrives as a native menu event rather than a
// keydown, so the focused element is the only reliable "what was I in" signal:
// a focused xterm's hidden textarea sits inside its side's root element.
export const BOTTOM_TERMINAL_SIDE_ATTR = 'data-bottom-terminal-side'

export function focusedBottomTerminalSide(active: Element | null): number | null {
  const host = active?.closest(`[${BOTTOM_TERMINAL_SIDE_ATTR}]`)
  if (!host) return null
  const side = Number(host.getAttribute(BOTTOM_TERMINAL_SIDE_ATTR))
  return Number.isInteger(side) ? side : null
}
