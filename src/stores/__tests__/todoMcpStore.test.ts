import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore, api } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  const api = { todosMcpEnable: vi.fn(), todosMcpDisable: vi.fn() }
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  vi.stubGlobal('window', { api })
  return { localStorageStore, api }
})

import { useTodoMcpStore } from '../todoMcpStore'

describe('todoMcpStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    api.todosMcpEnable.mockReset().mockResolvedValue(undefined)
    api.todosMcpDisable.mockReset().mockResolvedValue(undefined)
    useTodoMcpStore.setState({ enabled: false, pending: false, error: null })
  })

  it('defaults enabled to false', () => {
    expect(useTodoMcpStore.getState().enabled).toBe(false)
  })

  it('setEnabled(true) calls todosMcpEnable and flips state on success', async () => {
    await useTodoMcpStore.getState().setEnabled(true)

    expect(api.todosMcpEnable).toHaveBeenCalled()
    expect(useTodoMcpStore.getState().enabled).toBe(true)
    expect(useTodoMcpStore.getState().pending).toBe(false)
    expect(useTodoMcpStore.getState().error).toBeNull()
    expect(localStorageStore['vide:todo:mcpEnabled']).toBe('true')
  })

  it('setEnabled(false) calls todosMcpDisable and flips state', async () => {
    useTodoMcpStore.setState({ enabled: true })
    await useTodoMcpStore.getState().setEnabled(false)

    expect(api.todosMcpDisable).toHaveBeenCalled()
    expect(useTodoMcpStore.getState().enabled).toBe(false)
  })

  it('leaves enabled false and records an error when enabling fails', async () => {
    api.todosMcpEnable.mockRejectedValue(new Error("'claude' was not found in PATH"))

    await useTodoMcpStore.getState().setEnabled(true)

    expect(useTodoMcpStore.getState().enabled).toBe(false)
    expect(useTodoMcpStore.getState().pending).toBe(false)
    expect(useTodoMcpStore.getState().error).toMatch(/claude/i)
  })
})
