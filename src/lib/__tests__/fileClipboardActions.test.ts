import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileClipboardStore } from '@/stores/fileClipboardStore'
import { copyToClipboard, pasteInto, dropExternalFiles } from '../fileClipboardActions'

let api: {
  writeClipboardFiles: ReturnType<typeof vi.fn>
  readClipboardFiles: ReturnType<typeof vi.fn>
  copyInto: ReturnType<typeof vi.fn>
  moveInto: ReturnType<typeof vi.fn>
  pathForFile: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  useFileClipboardStore.getState().clear()
  api = {
    writeClipboardFiles: vi.fn().mockResolvedValue(undefined),
    readClipboardFiles: vi.fn().mockResolvedValue(null),
    copyInto: vi.fn(async (src: string, dir: string) => `${dir}/${src.split('/').pop()}`),
    moveInto: vi.fn(async (src: string, dir: string) => `${dir}/${src.split('/').pop()}`),
    pathForFile: vi.fn((f: { path: string }) => f.path),
  }
  vi.stubGlobal('window', { api })
})

describe('copyToClipboard', () => {
  it('writes the OS clipboard and remembers the operation', async () => {
    await copyToClipboard('/proj/a.txt', 'cut')
    expect(api.writeClipboardFiles).toHaveBeenCalledWith(['/proj/a.txt'], 'cut')
    expect(useFileClipboardStore.getState()).toMatchObject({ paths: ['/proj/a.txt'], mode: 'cut' })
  })
})

describe('pasteInto', () => {
  it('returns null and does nothing when the clipboard has no files', async () => {
    expect(await pasteInto('/proj/dest')).toBeNull()
    expect(api.copyInto).not.toHaveBeenCalled()
    expect(api.moveInto).not.toHaveBeenCalled()
  })

  it('copies files that came from outside vIDE', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/Users/x/a.txt', '/Users/x/b.txt'], mode: 'copy' })
    const result = await pasteInto('/proj/dest')
    expect(api.copyInto).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ moved: [], created: ['/proj/dest/a.txt', '/proj/dest/b.txt'] })
  })

  it('copies (does not move) after a vIDE copy', async () => {
    await copyToClipboard('/proj/a.txt', 'copy')
    api.readClipboardFiles.mockResolvedValue({ paths: ['/proj/a.txt'], mode: 'copy' })
    const result = await pasteInto('/proj/dest')
    expect(api.moveInto).not.toHaveBeenCalled()
    expect(result?.created).toEqual(['/proj/dest/a.txt'])
  })

  it('moves after a vIDE cut whose paths still match the OS clipboard (macOS reports copy)', async () => {
    await copyToClipboard('/proj/a.txt', 'cut')
    api.readClipboardFiles.mockResolvedValue({ paths: ['/proj/a.txt'], mode: 'copy' })
    const result = await pasteInto('/proj/dest')
    expect(api.moveInto).toHaveBeenCalledWith('/proj/a.txt', '/proj/dest')
    expect(result).toEqual({ moved: [{ from: '/proj/a.txt', to: '/proj/dest/a.txt' }], created: [] })
  })

  it('copies when the OS clipboard was overwritten since a vIDE cut', async () => {
    await copyToClipboard('/proj/a.txt', 'cut')
    api.readClipboardFiles.mockResolvedValue({ paths: ['/Users/x/other.txt'], mode: 'copy' })
    const result = await pasteInto('/proj/dest')
    expect(api.moveInto).not.toHaveBeenCalled()
    expect(result?.created).toEqual(['/proj/dest/other.txt'])
  })

  it('moves when another app put a "cut" on the clipboard (Linux)', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/home/x/a.txt'], mode: 'cut' })
    const result = await pasteInto('/proj/dest')
    expect(api.moveInto).toHaveBeenCalledWith('/home/x/a.txt', '/proj/dest')
    expect(result?.moved).toEqual([{ from: '/home/x/a.txt', to: '/proj/dest/a.txt' }])
  })

  it('after a move, points the clipboard at the new path as a copy and forgets the cut', async () => {
    await copyToClipboard('/proj/a.txt', 'cut')
    api.readClipboardFiles.mockResolvedValue({ paths: ['/proj/a.txt'], mode: 'copy' })
    await pasteInto('/proj/dest')
    expect(api.writeClipboardFiles).toHaveBeenLastCalledWith(['/proj/dest/a.txt'], 'copy')
    expect(useFileClipboardStore.getState()).toMatchObject({ paths: ['/proj/dest/a.txt'], mode: 'copy' })
  })

  it('ignores a move that was a no-op (source already in the target folder)', async () => {
    api.readClipboardFiles.mockResolvedValue({ paths: ['/proj/dest/a.txt'], mode: 'cut' })
    api.moveInto.mockResolvedValue('/proj/dest/a.txt')
    const result = await pasteInto('/proj/dest')
    expect(result).toEqual({ moved: [], created: [] })
  })
})

describe('dropExternalFiles', () => {
  it('copies each dropped file by its real path and skips files with no path', async () => {
    const files = [{ path: '/Users/x/a.txt' }, { path: '' }, { path: '/Users/x/b' }] as unknown as File[]
    const created = await dropExternalFiles(files, '/proj/dest')
    expect(api.copyInto).toHaveBeenCalledTimes(2)
    expect(created).toEqual(['/proj/dest/a.txt', '/proj/dest/b'])
  })
})
