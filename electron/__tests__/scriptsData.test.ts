import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  readScriptsData, createScript, updateScript, deleteScript, liveScripts, scriptsFile,
  scriptDisplayTitle, normalizeBody,
} from '../scriptsData'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'scripts-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('scriptsData', () => {
  it('reads an empty list when the file is missing or corrupt', async () => {
    expect(await readScriptsData(dir)).toEqual({ scripts: [] })
    await writeFile(scriptsFile(dir), '{not json', 'utf8')
    expect(await readScriptsData(dir)).toEqual({ scripts: [] })
  })

  it('round-trips a created script with shareOutput on by default', async () => {
    const s = await createScript(dir, { title: 'Pre-commit', description: 'Run hooks', body: 'pre-commit run' })
    const data = await readScriptsData(dir)
    expect(data.scripts).toEqual([s])
    expect(s.shareOutput).toBe(true)
    expect(s.createdAt).toBe(s.updatedAt)
  })

  it('update bumps updatedAt and applies the patch', async () => {
    const s = await createScript(dir, { title: 'A' })
    await new Promise((r) => setTimeout(r, 2))
    const u = await updateScript(dir, s.id, { body: 'ls', shareOutput: false })
    expect(u.body).toBe('ls')
    expect(u.shareOutput).toBe(false)
    expect(u.updatedAt).toBeGreaterThan(s.updatedAt)
  })

  it('delete leaves a tombstone that liveScripts hides, and update then throws', async () => {
    const s = await createScript(dir, { title: 'A', body: 'secret' })
    await deleteScript(dir, s.id)
    const data = await readScriptsData(dir)
    expect(data.scripts[0].deletedAt).toBeTypeOf('number')
    expect(data.scripts[0].body).toBe('')
    expect(liveScripts(data)).toEqual([])
    await expect(updateScript(dir, s.id, { title: 'B' })).rejects.toThrow()
  })

  it('normalizes bodies and display titles', () => {
    expect(normalizeBody('a\r\nb')).toBe('a\nb\n')
    expect(normalizeBody('a\n\n\n')).toBe('a\n')
    expect(normalizeBody('')).toBe('')
    expect(scriptDisplayTitle({ title: '  ' })).toBe('Untitled script')
    expect(scriptDisplayTitle({ title: 'X' })).toBe('X')
  })
})

describe('scriptsData write safety', () => {
  it('concurrent updates neither corrupt the file nor lose each other', async () => {
    const a = await createScript(dir, { title: 'A' })
    const b = await createScript(dir, { title: 'B' })
    await Promise.all([
      updateScript(dir, a.id, { body: 'one' }),
      updateScript(dir, b.id, { body: 'two' }),
      createScript(dir, { title: 'C' }),
    ])
    const data = await readScriptsData(dir)
    expect(data.scripts.map((s) => s.body).sort()).toEqual(['', 'one', 'two'])
  })

  it('refuses to write over a corrupt file instead of wiping it', async () => {
    await writeFile(scriptsFile(dir), '{"scripts": [ broken', 'utf8')
    await expect(createScript(dir, { title: 'X' })).rejects.toThrow(/corrupt/)
    const { readFile } = await import('fs/promises')
    expect(await readFile(scriptsFile(dir), 'utf8')).toBe('{"scripts": [ broken')
  })
})
