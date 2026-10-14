import { describe, it, expect, vi } from 'vitest'

describe('claudeStore agentBarCollapsed initial value', () => {
  it('reads a saved collapsed state on startup', async () => {
    vi.resetModules()
    ;(global as any).localStorage = {
      getItem: (k: string) => (k === 'vide-agent-bar-collapsed' ? '1' : null),
      setItem: () => {},
    }
    const { useClaudeStore } = await import('@/stores/claudeStore')
    expect(useClaudeStore.getState().agentBarCollapsed).toBe(true)
  })

  it('defaults to expanded when nothing is saved', async () => {
    vi.resetModules()
    ;(global as any).localStorage = { getItem: () => null, setItem: () => {} }
    const { useClaudeStore } = await import('@/stores/claudeStore')
    expect(useClaudeStore.getState().agentBarCollapsed).toBe(false)
  })
})
