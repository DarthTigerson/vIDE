import { describe, it, expect, beforeEach, vi } from 'vitest'

const { fsState } = vi.hoisted(() => ({
  fsState: { files: new Map<string, string>() },
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: { handle: () => {} },
}))

vi.mock('fs/promises', () => ({
  readFile: async (path: string) => {
    // Yield first so concurrent saves genuinely interleave their reads.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!fsState.files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return fsState.files.get(path)!
  },
  writeFile: async (path: string, data: string) => {
    fsState.files.set(path, data)
  },
  mkdir: async () => {},
}))

import { loadSession, saveSession, loadOpenWindows, saveOpenWindows } from '../session'

describe('session', () => {
  beforeEach(() => {
    fsState.files.clear()
  })

  it('merges each save into what is already on disk', async () => {
    await saveSession('/proj', { agentSessions: [{ id: 'a', kind: 'claude', hue: 'blue' }] })
    await saveSession('/proj', { activeTabPath: '/proj/a.ts' })
    expect(await loadSession('/proj')).toEqual({
      agentSessions: [{ id: 'a', kind: 'claude', hue: 'blue' }],
      activeTabPath: '/proj/a.ts',
    })
  })

  it('keeps both slices when two saves land at once', async () => {
    await Promise.all([
      saveSession('/proj', { activeTabPath: '/proj/a.ts' }),
      saveSession('/proj', { windowBounds: { x: 0, y: 0, width: 800, height: 600, maximized: false } }),
    ])
    const data = await loadSession('/proj')
    expect(data?.activeTabPath).toBe('/proj/a.ts')
    expect(data?.windowBounds?.width).toBe(800)
  })

  it('keeps projects in separate files', async () => {
    await saveSession('/one', { activeTabPath: '/one/a.ts' })
    await saveSession('/two', { activeTabPath: '/two/b.ts' })
    expect((await loadSession('/one'))?.activeTabPath).toBe('/one/a.ts')
    expect((await loadSession('/two'))?.activeTabPath).toBe('/two/b.ts')
  })

  it('round-trips the open-window list, and reads a missing or corrupt file as empty', async () => {
    expect(await loadOpenWindows()).toEqual([])
    await saveOpenWindows(['/one', '/two'])
    expect(await loadOpenWindows()).toEqual(['/one', '/two'])
    fsState.files.set('/fake/userData/window-session.json', 'not json')
    expect(await loadOpenWindows()).toEqual([])
  })
})

describe('getAgentSessionInfo', () => {
  it('remembers colour and name from saved and loaded sessions', async () => {
    const { getAgentSessionInfo } = await import('../session')
    await saveSession('/proj', { agentSessions: [{ id: 's1', kind: 'claude', hue: '#f80', name: 'Fix bug' }] })
    expect(getAgentSessionInfo('s1')).toEqual({ hue: '#f80', name: 'Fix bug' })
    expect(getAgentSessionInfo('unknown')).toBeUndefined()
  })
})
