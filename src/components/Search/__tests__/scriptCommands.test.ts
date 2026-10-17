import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/runScript', () => ({ runScriptInNewTerminal: vi.fn() }))

import { scriptCommands } from '../scriptCommands'
import { runScriptInNewTerminal } from '@/lib/runScript'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import type { Script } from '@/types/api'

const mk = (id: string, title: string): Script => ({ id, title, description: `does ${id}`, body: '', shareOutput: true, createdAt: 1, updatedAt: 1 })

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/p' })
  useScriptsSettingsStore.setState({ enabled: true })
  useScriptsStore.setState({ scripts: [mk('a', 'Alpha'), mk('b', 'Beta'), mk('c', '')], tags: { b: ['/p'] } })
})

describe('scriptCommands', () => {
  it('lists one Run Script command per script, tagged first', () => {
    expect(scriptCommands().map((c) => c.label)).toEqual(['Run Script: Beta', 'Run Script: Alpha', 'Run Script: Untitled script'])
    expect(scriptCommands()[0].description).toBe('does b')
  })

  it('runs the script in a new terminal', () => {
    scriptCommands()[0].action!()
    expect(runScriptInNewTerminal).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('lists nothing when the Scripts app is disabled', () => {
    useScriptsSettingsStore.setState({ enabled: false })
    expect(scriptCommands()).toEqual([])
  })
})
