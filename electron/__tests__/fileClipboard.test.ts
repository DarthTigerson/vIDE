import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// An in-memory stand-in for Electron 44's promise-based clipboard.
const store = new Map<string, string>()
const RAW = (name: string) => `electron application/osclipboard;format="${name}"`
vi.mock('electron', () => ({
  ClipboardItem: class {
    constructor(public data: Record<string, string>) {}
    get types() { return Object.keys(this.data) }
    async getType(type: string) { return new Blob([this.data[type]]) }
  },
  clipboard: {
    write: async (items: Array<{ data: Record<string, string> }>) => {
      store.clear()
      for (const item of items) for (const [k, v] of Object.entries(item.data)) store.set(k, v)
    },
    read: async () => (store.size === 0 ? [] : [{
      types: [...store.keys()],
      getType: async (type: string) => new Blob([store.get(type) ?? '']),
    }]),
  },
}))

import { writeClipboardFiles, readClipboardFiles } from '../fileClipboard'

function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('fileClipboard', () => {
  const realPlatform = process.platform
  beforeEach(() => store.clear())
  afterEach(() => setPlatform(realPlatform))

  it('darwin: writes the paths as a text/uri-list and reads it back as a copy', async () => {
    setPlatform('darwin')
    await writeClipboardFiles(['/proj/a b.txt'], 'cut')
    expect(store.get('text/uri-list')).toBe('file:///proj/a%20b.txt')
    expect(await readClipboardFiles()).toEqual({ paths: ['/proj/a b.txt'], mode: 'copy' })
  })

  it('darwin: reads a multi-file Finder copy from NSFilenamesPboardType', async () => {
    setPlatform('darwin')
    store.set(
      RAW('NSFilenamesPboardType'),
      '<plist><array><string>/a.txt</string><string>/b.txt</string></array></plist>',
    )
    expect(await readClipboardFiles()).toEqual({ paths: ['/a.txt', '/b.txt'], mode: 'copy' })
  })

  it('linux: round-trips a cut through x-special/gnome-copied-files', async () => {
    setPlatform('linux')
    await writeClipboardFiles(['/proj/a.txt'], 'cut')
    expect(await readClipboardFiles()).toEqual({ paths: ['/proj/a.txt'], mode: 'cut' })
  })

  it('linux: falls back to text/uri-list', async () => {
    setPlatform('linux')
    store.set('text/uri-list', 'file:///x.txt\r\n')
    expect(await readClipboardFiles()).toEqual({ paths: ['/x.txt'], mode: 'copy' })
  })

  it('returns null when the clipboard holds no files', async () => {
    setPlatform('darwin')
    expect(await readClipboardFiles()).toBeNull()
    setPlatform('linux')
    expect(await readClipboardFiles()).toBeNull()
  })

  it('writing an empty path list is a no-op', async () => {
    setPlatform('darwin')
    await writeClipboardFiles([], 'copy')
    expect(store.size).toBe(0)
  })
})
