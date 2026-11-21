import { useClaudeStore } from '@/stores/claudeStore'
import { useFileStore } from '@/stores/fileStore'

// Typed too early, /login lands before the CLI is reading its input and is
// lost, so it waits for the startup banner to finish drawing (the session's
// first busy -> idle edge). The fallback covers a CLI that starts without
// printing enough to register as busy.
const FALLBACK_MS = 15000

// Opens a new Claude session in the agent bar and runs /login in it, so a
// login that expired outside the chat (e.g. commit message generation) can be
// renewed in one click.
export function startClaudeLogin(): void {
  const root = useFileStore.getState().projectRoot
  if (!root) return
  const claude = useClaudeStore.getState()
  const id = claude.newSession(root, 'claude')
  claude.setChatVisible(true)

  let sent = false
  const send = () => {
    if (sent) return
    sent = true
    unsubscribe()
    clearTimeout(fallback)
    window.api.claudeWrite(id, '/login\r')
  }
  const unsubscribe = useClaudeStore.subscribe((s, prev) => {
    if (prev.busyByInstance[id] && !s.busyByInstance[id]) send()
  })
  const fallback = setTimeout(send, FALLBACK_MS)
}
