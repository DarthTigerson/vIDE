import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

import { startClaudeLogin } from '../claudeLogin'
import { useClaudeStore } from '@/stores/claudeStore'
import { useFileStore } from '@/stores/fileStore'

const claudeWrite = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  claudeWrite.mockReset()
  ;(globalThis as any).window = { api: { claudeWrite, sessionSave: vi.fn() } }
  useFileStore.setState({ projectRoot: '/proj' })
  useClaudeStore.setState({ instances: [], activeInstanceId: '', chatVisible: false, busyByInstance: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

function newSessionId(): string {
  return useClaudeStore.getState().activeInstanceId
}

describe('startClaudeLogin', () => {
  it('opens a visible Claude session and types /login once its startup output settles', () => {
    startClaudeLogin()
    const id = newSessionId()
    expect(useClaudeStore.getState().instances.find((i) => i.id === id)?.kind).toBe('claude')
    expect(useClaudeStore.getState().chatVisible).toBe(true)

    useClaudeStore.getState().setBusy(id, true)
    expect(claudeWrite).not.toHaveBeenCalled()
    useClaudeStore.getState().setBusy(id, false)
    expect(claudeWrite).toHaveBeenCalledWith(id, '/login\r')

    // Later turns of the same session don't retype it.
    useClaudeStore.getState().setBusy(id, true)
    useClaudeStore.getState().setBusy(id, false)
    vi.advanceTimersByTime(20000)
    expect(claudeWrite).toHaveBeenCalledTimes(1)
  })

  it('types /login after the fallback when the session never registers as busy', () => {
    startClaudeLogin()
    vi.advanceTimersByTime(15000)
    expect(claudeWrite).toHaveBeenCalledWith(newSessionId(), '/login\r')
  })

  it('does nothing without an open project', () => {
    useFileStore.setState({ projectRoot: null })
    startClaudeLogin()
    expect(useClaudeStore.getState().instances).toHaveLength(0)
    vi.advanceTimersByTime(15000)
    expect(claudeWrite).not.toHaveBeenCalled()
  })
})
