import type { SessionData } from '@/types/api'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { useFileStore } from '@/stores/fileStore'

// Saves each project's bottom terminal (switch, tabs, where moved terminals
// came from, panel height) into its session file next to the editor tabs,
// and brings it back when the project opens. Like editor terminal tabs, its
// terminals come back as fresh shells under their saved ids.

const SAVE_DEBOUNCE_MS = 500

// Same hold-off as lib/editorSession.ts: nothing is saved for a project until
// its own slice has been restored, so the empty state it starts with can't
// overwrite what it had.
let restoredRoot: string | null = null
let pending: { root: string; data: SessionData } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function flush(): void {
  clearTimeout(timer)
  timer = undefined
  if (!pending) return
  void window.api.sessionSave(pending.root, pending.data)
  pending = null
}

// Called when a project opens, before its session loads: the previous
// project's terminals go (their PTYs die as their tabs unmount ownerless).
export function resetBottomTerminal(): void {
  flush()
  restoredRoot = null
  useBottomTerminalStore.getState().reset()
}

// After the editor tabs are restored, so any terminal tabs among them are
// swept into the bottom terminal when it comes back switched on.
export function restoreBottomTerminal(root: string, data: SessionData | null): void {
  if (useFileStore.getState().projectRoot !== root) return
  useBottomTerminalStore.getState().hydrate(data?.bottomTerminal)
  restoredRoot = root
}

export function startBottomTerminalPersistence(): () => void {
  const unsubscribe = useBottomTerminalStore.subscribe((state, prev) => {
    if (
      state.enabled === prev.enabled &&
      state.sides === prev.sides &&
      state.active === prev.active &&
      state.origins === prev.origins &&
      state.size === prev.size
    ) return
    const root = useFileStore.getState().projectRoot
    if (!root || root !== restoredRoot) return
    const { enabled, sides, active, origins, size } = state
    pending = { root, data: { bottomTerminal: { enabled, sides, active, origins, size } } }
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  })
  window.addEventListener('beforeunload', flush)
  return () => {
    unsubscribe()
    window.removeEventListener('beforeunload', flush)
    flush()
    restoredRoot = null
  }
}
