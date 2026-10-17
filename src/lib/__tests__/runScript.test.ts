import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

const api = { termWrite: vi.fn(), scriptsTagAdd: vi.fn(async () => ({ s1: ['/p'] })), sessionSave: vi.fn(async () => {}) }
vi.stubGlobal('window', { api })

import { runScriptInTerminal, runScriptInNewTerminal } from '../runScript'
import { pendingTerminalCommands } from '../pendingTerminalCommands'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useScriptsStore } from '@/stores/scriptsStore'
import type { Script } from '@/types/api'

const script: Script = { id: 's1', title: 'Hi', description: '', body: 'echo hi', shareOutput: true, createdAt: 1, updatedAt: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  pendingTerminalCommands.clear()
  useFileStore.setState({ projectRoot: '/p' })
})

describe('runScriptInTerminal', () => {
  it('types the normalized body into that terminal and tags the project', () => {
    runScriptInTerminal(script, 'term-1')
    expect(api.termWrite).toHaveBeenCalledWith('term-1', 'echo hi\n')
    expect(api.scriptsTagAdd).toHaveBeenCalledWith('s1', '/p')
  })

  it('does not tag when no project is open', () => {
    useFileStore.setState({ projectRoot: null })
    runScriptInTerminal(script, 'term-1')
    expect(api.scriptsTagAdd).not.toHaveBeenCalled()
  })
})

describe('runScriptInNewTerminal', () => {
  it('queues the command before opening the tab, and names the tab after the script', () => {
    const openTab = vi.spyOn(useEditorStore.getState(), 'openTab').mockImplementation(() => {
      expect(pendingTerminalCommands.get(id)).toBe('echo hi\n')
    })
    useEditorStore.setState({ openTab })
    const id = 'script-x'
    expect(runScriptInNewTerminal(script, undefined, id)).toBe(id)
    expect(openTab).toHaveBeenCalledWith({ path: 'terminal://script-x', content: '', dirty: false })
    expect(useScriptsStore.getState().terminalTitles[id]).toBe('Hi')
  })

  it('uses a provided command verbatim', () => {
    useEditorStore.setState({ openTab: vi.fn() })
    const id = runScriptInNewTerminal(script, 'marked\n')
    expect(pendingTerminalCommands.get(id)).toBe('marked\n')
  })
})

describe('runScriptInAgentTerminal', () => {
  it('opens a new agent-bar terminal session named after the script, with the script queued in it', async () => {
    const { runScriptInAgentTerminal } = await import('../runScript')
    const { useClaudeStore } = await import('@/stores/claudeStore')
    useClaudeStore.setState({ instances: [], activeInstanceId: null, chatVisible: false })
    const id = runScriptInAgentTerminal(script, '/p')
    const inst = useClaudeStore.getState().instances.find((i) => i.id === id)
    expect(inst).toMatchObject({ kind: 'terminal', name: 'Hi' })
    expect(useClaudeStore.getState().activeInstanceId).toBe(id)
    expect(useClaudeStore.getState().chatVisible).toBe(true)
    expect(pendingTerminalCommands.get(id)).toBe('echo hi\n')
    expect(api.scriptsTagAdd).toHaveBeenCalledWith('s1', '/p')
  })
})
