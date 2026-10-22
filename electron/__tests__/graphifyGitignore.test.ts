// electron/__tests__/graphifyGitignore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getGraphifyGitignoreStatus, addGraphifyOutToGitignore, graphifyOutNeedsGitignore } from '../graphifyGitignore'

describe('graphifyGitignore', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-graphify-gitignore-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const initRepo = () => execFileSync('git', ['init', '-q'], { cwd: dir })

  it('reports notRepo outside a git repository', async () => {
    expect(await getGraphifyGitignoreStatus(dir)).toBe('notRepo')
  })

  it('reports notIgnored in a repo without a matching rule', async () => {
    initRepo()
    expect(await getGraphifyGitignoreStatus(dir)).toBe('notIgnored')
  })

  it('honors broader patterns, not just the exact entry', async () => {
    initRepo()
    writeFileSync(join(dir, '.gitignore'), '*-out/\n')
    expect(await getGraphifyGitignoreStatus(dir)).toBe('ignored')
  })

  it('creates .gitignore when missing', async () => {
    initRepo()
    expect(await addGraphifyOutToGitignore(dir)).toEqual({ ok: true, output: '' })
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('graphify-out/\n')
    expect(await getGraphifyGitignoreStatus(dir)).toBe('ignored')
  })

  it('appends on a new line when the existing file has no trailing newline', async () => {
    initRepo()
    writeFileSync(join(dir, '.gitignore'), 'node_modules')
    await addGraphifyOutToGitignore(dir)
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('node_modules\ngraphify-out/\n')
  })

  it('does not duplicate the entry when already ignored', async () => {
    initRepo()
    writeFileSync(join(dir, '.gitignore'), 'graphify-out/\n')
    await addGraphifyOutToGitignore(dir)
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toBe('graphify-out/\n')
  })

  it('refuses outside a git repository', async () => {
    const result = await addGraphifyOutToGitignore(dir)
    expect(result.ok).toBe(false)
  })

  it('needs a gitignore once graphify-out exists in a repo that does not ignore it', async () => {
    initRepo()
    mkdirSync(join(dir, 'graphify-out'))
    expect(await graphifyOutNeedsGitignore(dir)).toBe(true)
  })

  it('does not need a gitignore before a graph has been built', async () => {
    initRepo()
    expect(await graphifyOutNeedsGitignore(dir)).toBe(false)
  })

  it('does not need a gitignore once the entry is added', async () => {
    initRepo()
    mkdirSync(join(dir, 'graphify-out'))
    await addGraphifyOutToGitignore(dir)
    expect(await graphifyOutNeedsGitignore(dir)).toBe(false)
  })

  it('does not need a gitignore outside a git repository', async () => {
    mkdirSync(join(dir, 'graphify-out'))
    expect(await graphifyOutNeedsGitignore(dir)).toBe(false)
  })
})
