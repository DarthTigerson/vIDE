// electron/__tests__/graphifyHooks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findBrokenGraphifyHookPaths } from '../graphifyHooks'

const settingsWith = (...commands: string[]) => JSON.stringify({
  hooks: {
    PreToolUse: commands.map((command) => ({ matcher: 'Bash', hooks: [{ type: 'command', command }] })),
  },
})

describe('findBrokenGraphifyHookPaths', () => {
  let dir: string

  const writeSettings = (content: string) => writeFileSync(join(dir, '.claude', 'settings.json'), content)

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-graphify-hooks-'))
    mkdirSync(join(dir, '.claude', 'skills', 'graphify'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'skills', 'graphify', 'SKILL.md'), '')
    mkdirSync(join(dir, 'graphify-out'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports an absolute graphify path that does not exist on this machine', async () => {
    writeSettings(settingsWith('/Users/someone-else/.local/bin/graphify hook-guard search'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual(['/Users/someone-else/.local/bin/graphify'])
  })

  it('dedupes the same dead path across hooks', async () => {
    writeSettings(settingsWith('/nope/graphify hook-guard search', '/nope/graphify hook-guard read'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual(['/nope/graphify'])
  })

  it('ignores a bare graphify command', async () => {
    writeSettings(settingsWith('graphify hook-guard search'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('ignores an absolute graphify path that exists', async () => {
    const bin = join(dir, 'graphify')
    writeFileSync(bin, '')
    writeSettings(settingsWith(`${bin} hook-guard search`))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('ignores hooks for other tools', async () => {
    writeSettings(settingsWith('/nope/prettier --check'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('skips projects without the graphify skill', async () => {
    rmSync(join(dir, '.claude', 'skills'), { recursive: true })
    writeSettings(settingsWith('/nope/graphify hook-guard search'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('skips projects without a graphify-out folder', async () => {
    rmSync(join(dir, 'graphify-out'), { recursive: true })
    writeSettings(settingsWith('/nope/graphify hook-guard search'))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('returns nothing for a missing or malformed settings file', async () => {
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
    writeSettings('{ not json')
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
    writeSettings(JSON.stringify({ hooks: { PreToolUse: 'oops' } }))
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })

  it('skips a graphify-out folder that is tracked in git', async () => {
    writeSettings(settingsWith('/nope/graphify hook-guard search'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual(['/nope/graphify'])

    writeFileSync(join(dir, 'graphify-out', 'graph.json'), '{}')
    execFileSync('git', ['add', 'graphify-out'], { cwd: dir })
    expect(await findBrokenGraphifyHookPaths(dir)).toEqual([])
  })
})
