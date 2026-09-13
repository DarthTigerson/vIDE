import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { discardAllChanges } from '../git'

const execFileAsync = promisify(execFile)

describe('discardAllChanges', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'git-discard-all-'))
    await execFileAsync('git', ['init', '-q'], { cwd: root })
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: root })
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root })
    await writeFile(join(root, 'tracked.txt'), 'original\n')
    await execFileAsync('git', ['add', 'tracked.txt'], { cwd: root })
    await execFileAsync('git', ['commit', '-q', '-m', 'init'], { cwd: root })
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reverts an unstaged modification to a tracked file', async () => {
    await writeFile(join(root, 'tracked.txt'), 'edited\n')

    await discardAllChanges(root)

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n')
  })

  it('leaves a staged modification to a tracked file untouched (VIDE-11)', async () => {
    await writeFile(join(root, 'tracked.txt'), 'staged-edit\n')
    await execFileAsync('git', ['add', 'tracked.txt'], { cwd: root })

    await discardAllChanges(root)

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('staged-edit\n')
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: root })
    expect(stdout.trim()).toBe('M  tracked.txt')
  })

  it('discards an unstaged edit made on top of a staged one, keeping the staged version', async () => {
    await writeFile(join(root, 'tracked.txt'), 'staged-edit\n')
    await execFileAsync('git', ['add', 'tracked.txt'], { cwd: root })
    await writeFile(join(root, 'tracked.txt'), 'further-unstaged-edit\n')

    await discardAllChanges(root)

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('staged-edit\n')
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: root })
    expect(stdout.trim()).toBe('M  tracked.txt')
  })

  it('leaves untracked files alone', async () => {
    await writeFile(join(root, 'untracked.txt'), 'new file\n')

    await discardAllChanges(root)

    expect(await readFile(join(root, 'untracked.txt'), 'utf-8')).toBe('new file\n')
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: root })
    expect(stdout.trim()).toBe('?? untracked.txt')
  })
})
