import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const buffers = new Map<string, Buffer>()
vi.mock('electron', () => ({
  clipboard: {
    writeBuffer: (format: string, data: Buffer) => { buffers.clear(); buffers.set(format, data) },
    readBuffer: (format: string) => buffers.get(format) ?? Buffer.alloc(0),
  },
}))

import { writeClipboardFiles, readClipboardFiles } from '../fileClipboard'

function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('fileClipboard', () => {
  const realPlatform = process.platform
  beforeEach(() => buffers.clear())
  afterEach(() => setPlatform(realPlatform))

  it('darwin: writes the first path as public.file-url and reads it back as a copy', () => {
    setPlatform('darwin')
    writeClipboardFiles(['/proj/a b.txt'], 'cut')
    expect(buffers.get('public.file-url')?.toString('utf8')).toBe('file:///proj/a%20b.txt')
    expect(readClipboardFiles()).toEqual({ paths: ['/proj/a b.txt'], mode: 'copy' })
  })

  it('darwin: reads a multi-file Finder copy from NSFilenamesPboardType', () => {
    setPlatform('darwin')
    buffers.set(
      'NSFilenamesPboardType',
      Buffer.from('<plist><array><string>/a.txt</string><string>/b.txt</string></array></plist>'),
    )
    expect(readClipboardFiles()).toEqual({ paths: ['/a.txt', '/b.txt'], mode: 'copy' })
  })

  it('linux: round-trips a cut through x-special/gnome-copied-files', () => {
    setPlatform('linux')
    writeClipboardFiles(['/proj/a.txt'], 'cut')
    expect(readClipboardFiles()).toEqual({ paths: ['/proj/a.txt'], mode: 'cut' })
  })

  it('linux: falls back to text/uri-list', () => {
    setPlatform('linux')
    buffers.set('text/uri-list', Buffer.from('file:///x.txt\r\n'))
    expect(readClipboardFiles()).toEqual({ paths: ['/x.txt'], mode: 'copy' })
  })

  it('returns null when the clipboard holds no files', () => {
    setPlatform('darwin')
    expect(readClipboardFiles()).toBeNull()
    setPlatform('linux')
    expect(readClipboardFiles()).toBeNull()
  })

  it('writing an empty path list is a no-op', () => {
    setPlatform('darwin')
    writeClipboardFiles([], 'copy')
    expect(buffers.size).toBe(0)
  })
})
