import { useEffect } from 'react'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'

// Shift+Tab toggles agent mode for the Bridge/llama session the chat panel
// is showing (BridgeChat only mounts for the active one).
export function useBridgeAgentModeShortcut(sessionId: string): void {
  const chatVisible = useClaudeStore((s) => s.chatVisible)
  const isActive = useClaudeStore((s) => s.activeInstanceId === sessionId)
  const enabled = chatVisible && isActive

  useEffect(() => {
    if (!enabled) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !e.shiftKey) return
      e.preventDefault()
      useBridgeStore.getState().toggleAgentMode(sessionId)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, sessionId])
}
