import { useClaudeStore } from '@/stores/claudeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { formatTerminalSelectionForAssistant } from '@/lib/sendSelectionToAssistant'

interface SelectableTerminal {
  hasSelection: () => boolean
  getSelection: () => string
}

// xterm's custom key handler for a terminal tab: return false to stop xterm
// from handling the key, true to let it (and the app) carry on.
//
// - CmdOrCtrl+L with a selection sends it to the assistant, like the editor's
//   Cmd+L. preventDefault is what keeps the native "Show Claude Chat" menu
//   accelerator (also CmdOrCtrl+L) from firing on top of it. With no
//   selection the key is left alone, so that menu action still just focuses
//   the chat — same as the editor.
// - CmdOrCtrl+=/-/0 (unshifted) resize just this terminal; shifted variants
//   are left unhandled so they pass through to the app-level global zoom.
export function createTerminalKeyHandler(terminalId: string, xterm: SelectableTerminal) {
  return (event: KeyboardEvent): boolean => {
    if (event.type !== 'keydown') return true
    const isMod = event.metaKey || event.ctrlKey
    if (!isMod || event.shiftKey || event.altKey) return true

    if (event.key.toLowerCase() === 'l') {
      if (!xterm.hasSelection()) return true
      event.preventDefault()
      useClaudeStore.getState().sendSelection(formatTerminalSelectionForAssistant(xterm.getSelection()))
      return false
    }
    if (event.key === '=' || event.key === '+') {
      useInstanceFontSizeStore.getState().increase(terminalId)
      return false
    }
    if (event.key === '-' || event.key === '_') {
      useInstanceFontSizeStore.getState().decrease(terminalId)
      return false
    }
    if (event.key === '0') {
      useInstanceFontSizeStore.getState().reset(terminalId)
      return false
    }
    return true
  }
}
