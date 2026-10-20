// electron/__tests__/gitignoreEntries.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { getGitignoreStatus, addGitignoreEntry, removeGitignoreEntry } from '../gitignoreEntries'

describe('gitignoreEntries', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-gitignore-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const initRepo = () => execFileSync('git', ['init', '-q'], { cwd: dir })
  const gitignore = () => readFileSync(join(dir, '.gitignore'), 'utf-8')

  it('reports a non-repo, with or without patterns', async () => {
    expect(await getGitignoreStatus(dir, ['node_modules/'])).toEqual({ repo: false })
    expect(await getGitignoreStatus(dir, [])).toEqual({ repo: false })
  })

  it('reports which of several patterns are ignored', async () => {
    initRepo()
    expect(await getGitignoreStatus(dir, [])).toEqual({ repo: true, ignored: [] })
    expect(await getGitignoreStatus(dir, ['node_modules/', '.DS_Store'])).toEqual({ repo: true, ignored: [] })
    writeFileSync(join(dir, '.gitignore'), '.DS_Store\n*.cache/\n')
    expect(await getGitignoreStatus(dir, ['node_modules/', '.DS_Store', '.pytest.cache/'])).toEqual({
      repo: true,
      ignored: ['.DS_Store', '.pytest.cache/'],
    })
  })

  it('adds an entry, creating .gitignore and not duplicating it', async () => {
    initRepo()
    expect(await addGitignoreEntry(dir, '.venv/')).toEqual({ ok: true, output: '' })
    await addGitignoreEntry(dir, '.venv/')
    expect(gitignore()).toBe('.venv/\n')
  })

  it('appends on a new line when the file has no trailing newline', async () => {
    initRepo()
    writeFileSync(join(dir, '.gitignore'), 'dist')
    await addGitignoreEntry(dir, '.idea/')
    expect(gitignore()).toBe('dist\n.idea/\n')
  })

  it('refuses to add outside a git repository', async () => {
    expect((await addGitignoreEntry(dir, '.idea/')).ok).toBe(false)
  })

  it('removes slash variants of the same name only', async () => {
    initRepo()
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n/.idea/\ndist\n.idea\n.idea-old/\n')
    expect(await removeGitignoreEntry(dir, '.idea/')).toEqual({ ok: true, output: '' })
    expect(gitignore()).toBe('node_modules\ndist\n.idea-old/\n')
  })

  it('removing with a missing .gitignore is a no-op', async () => {
    initRepo()
    expect(await removeGitignoreEntry(dir, '.idea/')).toEqual({ ok: true, output: '' })
  })
})
