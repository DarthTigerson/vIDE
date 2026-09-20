import { describe, it, expect, vi } from 'vitest'

// Some stores read localStorage at import time, and this suite runs in node.
vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/platform', () => ({ isMac: true }))
vi.mock('@/lib/monacoCommands', () => ({ getMonacoCommands: () => [] }))

import { getAllCommands } from '../commandRegistry'

const ORIGINAL_IDS = [
  'new-terminal',
  'git-graph',
  'git-log',
  'git-branch-diff',
  'settings-display',
  'settings-editor',
  'settings-git',
  'switch-to-claude',
  'switch-to-bridge',
]

describe('commandRegistry', () => {
  const commands = getAllCommands()

  it('keeps every command that existed before the overhaul', () => {
    const ids = commands.map((c) => c.id)
    for (const id of ORIGINAL_IDS) expect(ids).toContain(id)
  })

  it('has unique ids', () => {
    const ids = commands.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every command a "Category: Name" label (or a plain name, like New Terminal) and exactly one of action/pick', () => {
    for (const c of commands) {
      expect(c.label).toMatch(/^[A-Za-z]+(: | ).+/)
      expect(Boolean(c.action) !== Boolean(c.pick)).toBe(true)
    }
  })
})
