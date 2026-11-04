import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getGitStatus } from '../git'

const execFileAsync = promisify(execFile)

async function initRepo(dir: string) {
  await execFileAsync('git', ['init', '-q'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await execFileAsync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir })
}

// Without --untracked-files=all git collapses a new folder into one
// `?? newdir/` entry, which the Git panel rendered as a nameless "?" row.
describe('getGitStatus — untracked folders', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'git-status-untracked-'))
    await initRepo(root)
    await mkdir(join(root, 'newdir', 'sub'), { recursive: true })
    await writeFile(join(root, 'newdir', 'a.txt'), 'a\n')
    await writeFile(join(root, 'newdir', 'sub', 'b.txt'), 'b\n')
    await mkdir(join(root, 'nested'))
    await initRepo(join(root, 'nested'))
    await writeFile(join(root, 'nested', 'x.txt'), 'x\n')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists every file inside an untracked folder individually', async () => {
    const { unstaged } = await getGitStatus(root)
    const paths = unstaged.map((e) => e.path)
    expect(paths).toContain('newdir/a.txt')
    expect(paths).toContain('newdir/sub/b.txt')
    expect(paths).not.toContain('newdir/')
  })

  it('keeps a nested repo as one folder entry — git never lists inside another repo', async () => {
    const { unstaged } = await getGitStatus(root)
    expect(unstaged).toContainEqual({ path: 'nested/', status: '?' })
  })

  it('reports the nested repo\'s own files when queried as its own repo (multi-repo mode)', async () => {
    const { unstaged } = await getGitStatus(join(root, 'nested'))
    expect(unstaged).toEqual([{ path: 'x.txt', status: '?' }])
  })
})
