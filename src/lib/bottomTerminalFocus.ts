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

// Where keyboard focus goes after Cmd+W closes a bottom terminal: the side's
// next active terminal (or a neighbouring side's), else the active editor
// pane. Without this the closed xterm takes focus down with it, focus falls
// to <body>, and the next Cmd+W no longer knows it was in the terminal.
// Deferred two frames so React has mounted the newly active TerminalTab.
export function focusAfterBottomTerminalClose(deps: {
  nextTerminalId: () => string | null
  focusTerminal: (id: string) => void
  activePaneId: () => string
}): void {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const id = deps.nextTerminalId()
    if (id) {
      deps.focusTerminal(id)
      return
    }
    const pane = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(deps.activePaneId())}"]`)
    // Monaco's hidden input textarea; panes without one (browser, git pages)
    // get nothing, and Cmd+W then falls through to the editor tab anyway.
    pane?.querySelector<HTMLElement>('textarea')?.focus()
  }))
}
