import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildScriptsTools } from '../scriptsTools'
import { addScriptTag } from '../../scriptTags'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'scripts-mcp-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

function tool(name: string, run?: (id: string) => Promise<string>) {
  const t = buildScriptsTools(dir, run).find((x) => x.name === name)
  if (!t) throw new Error(`missing tool ${name}`)
  return t
}

describe('vide-scripts tools', () => {
  it('has no delete tool', () => {
    expect(buildScriptsTools(dir).map((t) => t.name).sort()).toEqual(
      ['create_script', 'list_scripts', 'read_script', 'run_script', 'update_script'],
    )
  })

  it('create → list → read → update round trip, with tags and share flag', async () => {
    expect(await tool('list_scripts').handler({})).toBe('No scripts yet.')
    const created = await tool('create_script').handler({ title: 'Pre-commit', description: 'Run hooks', body: 'pre-commit run -a' })
    const id = String(created).replace('Created ', '')
    await addScriptTag(dir, id, '/work/repo')

    const listed = String(await tool('list_scripts').handler({}))
    expect(listed).toContain(`id: ${id}`)
    expect(listed).toContain('title: Pre-commit')
    expect(listed).toContain('description: Run hooks')
    expect(listed).toContain('share output: yes')
    expect(listed).toContain('used in: /work/repo')
    expect(listed).not.toContain('pre-commit run -a')

    await tool('update_script').handler({ id, share_output: false, body: 'pre-commit run' })
    const read = String(await tool('read_script').handler({ id }))
    expect(read).toContain('share output: no')
    expect(read).toContain('body:\npre-commit run')
  })

  it('read_script on an unknown id errors', async () => {
    await expect(tool('read_script').handler({ id: 'nope' })).rejects.toThrow(/not found/)
  })

  it('run_script without a vIDE panel says nothing was run', async () => {
    const text = await tool('run_script').handler({ id: 'x' })
    expect(text).toBe('run_script only works from a Claude panel inside vIDE; nothing was run.')
  })

  it('run_script delegates to the runner when available', async () => {
    const run = vi.fn(async () => 'Script "A" finished with exit code 0 (success).\n\nOutput:\nok')
    expect(await tool('run_script', run).handler({ id: 'abc' })).toContain('exit code 0')
    expect(run).toHaveBeenCalledWith('abc')
  })
})
