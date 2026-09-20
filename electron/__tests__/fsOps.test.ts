import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, readFile as readFileRaw, stat } from 'fs/promises'
import { tmpdir, homedir } from 'os'
import { join } from 'path'

const trashItemMock = vi.fn(async (_path: string) => undefined)
vi.mock('electron', () => ({
  shell: { trashItem: (path: string) => trashItemMock(path) },
}))

import {
  listAllFiles, searchText, buildTree, readImageDataUrl,
  readTextFile, pathExists, getHomeDir,
  writeFile as writeFileOp, mkdir as mkdirOp, renamePath, trashPath,
  copyInto, moveInto, uniqueDestPath,
} from '../fsOps'

describe('fsOps', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fsops-'))
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'a.txt'), 'hello world\nfoo bar\n')
    await writeFile(join(root, 'sub', 'b.txt'), 'HELLO again\n')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('listAllFiles recurses into subdirectories', async () => {
    const files = await listAllFiles(root)
    expect(files.sort()).toEqual([join(root, 'a.txt'), join(root, 'sub', 'b.txt')].sort())
  })

  it('searchText finds case-sensitive matches with line/col', async () => {
    const matches = await searchText(root, 'hello', true)
    expect(matches.length).toBe(1)
    expect(matches[0].path).toBe(join(root, 'a.txt'))
    expect(matches[0].line).toBe(1)
    expect(matches[0].col).toBe(1)
  })

  it('searchText is case-insensitive when caseSensitive is false', async () => {
    const matches = await searchText(root, 'hello', false)
    expect(matches.length).toBe(2)
  })

  it('buildTree lists a single directory level, directories first, sorted', async () => {
    const tree = await buildTree(root)
    expect(tree.map((n) => n.name)).toEqual(['sub', 'a.txt'])
    expect(tree[0].isDirectory).toBe(true)
    expect(tree[1].isDirectory).toBe(false)
  })

  it('readImageDataUrl encodes file contents as a base64 data url with the right mime type', async () => {
    const pngPath = join(root, 'pixel.png')
    await writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const dataUrl = await readImageDataUrl(pngPath)
    expect(dataUrl).toBe('data:image/png;base64,iVBORw==')
  })

  it('readImageDataUrl falls back to octet-stream for unknown extensions', async () => {
    const path = join(root, 'mystery.xyz')
    await writeFile(path, Buffer.from([1, 2, 3]))
    const dataUrl = await readImageDataUrl(path)
    expect(dataUrl.startsWith('data:application/octet-stream;base64,')).toBe(true)
  })

  it('readTextFile reads a file as utf-8', async () => {
    const content = await readTextFile(join(root, 'a.txt'))
    expect(content).toBe('hello world\nfoo bar\n')
  })

  it('pathExists resolves true for an existing path and false for a missing one', async () => {
    expect(await pathExists(join(root, 'a.txt'))).toBe(true)
    expect(await pathExists(join(root, 'does-not-exist.txt'))).toBe(false)
  })

  it('getHomeDir returns the OS home directory', () => {
    expect(getHomeDir()).toBe(homedir())
  })

  it('writeFile writes utf-8 content to disk', async () => {
    const target = join(root, 'written.txt')
    await writeFileOp(target, 'written content')
    expect(await readFileRaw(target, 'utf-8')).toBe('written content')
  })

  it('mkdir creates a new directory non-recursively', async () => {
    const dir = join(root, 'newdir')
    await mkdirOp(dir)
    expect((await stat(dir)).isDirectory()).toBe(true)
  })

  it('mkdir rejects when the parent directory does not exist (recursive: false)', async () => {
    const nested = join(root, 'missing-parent', 'child')
    await expect(mkdirOp(nested)).rejects.toThrow()
  })

  it('renamePath moves a file from one path to another', async () => {
    const from = join(root, 'rename-src.txt')
    const to = join(root, 'rename-dst.txt')
    await writeFile(from, 'rename me')
    await renamePath(from, to)
    expect(await pathExists(from)).toBe(false)
    expect(await readFileRaw(to, 'utf-8')).toBe('rename me')
  })

  it('trashPath delegates to electron shell.trashItem with the given path', async () => {
    await trashPath('/some/path.txt')
    expect(trashItemMock).toHaveBeenCalledWith('/some/path.txt')
  })
})

describe('copyInto / moveInto', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fsops-copy-'))
    await mkdir(join(dir, 'dest'))
    await mkdir(join(dir, 'tree', 'nested'), { recursive: true })
    await writeFile(join(dir, 'a.txt'), 'A')
    await writeFile(join(dir, 'tree', 'nested', 'deep.txt'), 'DEEP')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('uniqueDestPath returns the plain name when free', async () => {
    expect(await uniqueDestPath(join(dir, 'dest'), 'a.txt', false)).toBe(join(dir, 'dest', 'a.txt'))
  })

  it('uniqueDestPath appends "copy" then "copy 2" before the extension', async () => {
    await writeFile(join(dir, 'dest', 'a.txt'), 'x')
    expect(await uniqueDestPath(join(dir, 'dest'), 'a.txt', false)).toBe(join(dir, 'dest', 'a copy.txt'))
    await writeFile(join(dir, 'dest', 'a copy.txt'), 'x')
    expect(await uniqueDestPath(join(dir, 'dest'), 'a.txt', false)).toBe(join(dir, 'dest', 'a copy 2.txt'))
  })

  it('uniqueDestPath treats a dotted directory name as having no extension', async () => {
    await mkdir(join(dir, 'dest', 'v1.2'))
    expect(await uniqueDestPath(join(dir, 'dest'), 'v1.2', true)).toBe(join(dir, 'dest', 'v1.2 copy'))
  })

  it('copyInto copies a file and leaves the source', async () => {
    const out = await copyInto(join(dir, 'a.txt'), join(dir, 'dest'))
    expect(out).toBe(join(dir, 'dest', 'a.txt'))
    expect(await readFileRaw(out, 'utf-8')).toBe('A')
    expect(await readFileRaw(join(dir, 'a.txt'), 'utf-8')).toBe('A')
  })

  it('copyInto copies a directory recursively', async () => {
    const out = await copyInto(join(dir, 'tree'), join(dir, 'dest'))
    expect(await readFileRaw(join(out, 'nested', 'deep.txt'), 'utf-8')).toBe('DEEP')
  })

  it('copyInto duplicates with a "copy" name when pasting into the same folder', async () => {
    const out = await copyInto(join(dir, 'a.txt'), dir)
    expect(out).toBe(join(dir, 'a copy.txt'))
    expect(await readFileRaw(out, 'utf-8')).toBe('A')
  })

  it('copyInto refuses to copy a folder into itself or a descendant', async () => {
    await expect(copyInto(join(dir, 'tree'), join(dir, 'tree'))).rejects.toThrow(/into itself/)
    await expect(copyInto(join(dir, 'tree'), join(dir, 'tree', 'nested'))).rejects.toThrow(/into itself/)
  })

  it('moveInto moves a file and removes the source', async () => {
    const out = await moveInto(join(dir, 'a.txt'), join(dir, 'dest'))
    expect(out).toBe(join(dir, 'dest', 'a.txt'))
    expect(await readFileRaw(out, 'utf-8')).toBe('A')
    await expect(stat(join(dir, 'a.txt'))).rejects.toThrow()
  })

  it('moveInto is a no-op when the source is already in the target folder', async () => {
    const out = await moveInto(join(dir, 'a.txt'), dir)
    expect(out).toBe(join(dir, 'a.txt'))
    expect(await readFileRaw(join(dir, 'a.txt'), 'utf-8')).toBe('A')
  })

  it('moveInto uses a "copy" name on collision instead of overwriting', async () => {
    await writeFile(join(dir, 'dest', 'a.txt'), 'EXISTING')
    const out = await moveInto(join(dir, 'a.txt'), join(dir, 'dest'))
    expect(out).toBe(join(dir, 'dest', 'a copy.txt'))
    expect(await readFileRaw(join(dir, 'dest', 'a.txt'), 'utf-8')).toBe('EXISTING')
  })

  it('moveInto refuses to move a folder into itself or a descendant', async () => {
    await expect(moveInto(join(dir, 'tree'), join(dir, 'tree', 'nested'))).rejects.toThrow(/into itself/)
  })
})
