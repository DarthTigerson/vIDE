import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

export interface LiveTerminal {
  xterm: XTerm
  fit: FitAddon
}

// Keeps TerminalTab's XTerm instances alive across React remounts (split pane
// reflows, StrictMode double-invoke, tab switching). Lives outside the
// component so stores can reach a terminal without importing xterm itself.
export const liveTerminals = new Map<string, LiveTerminal>()

export function clearLiveTerminal(id: string): void {
  liveTerminals.get(id)?.xterm.clear()
}
