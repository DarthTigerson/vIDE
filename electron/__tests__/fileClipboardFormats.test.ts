import { describe, it, expect } from 'vitest'
import {
  toFileUrl, encodeGnomeCopiedFiles, decodeGnomeCopiedFiles,
  decodeUriList, decodeFilenamesPlist, decodeFileUrl,
} from '../fileClipboardFormats'

describe('fileClipboardFormats', () => {
  it('toFileUrl percent-encodes spaces', () => {
    expect(toFileUrl('/proj/my file.txt')).toBe('file:///proj/my%20file.txt')
  })

  it('gnome format round-trips copy and cut with special characters', () => {
    const paths = ['/a/b c.txt', '/a/d#e.txt']
    for (const mode of ['copy', 'cut'] as const) {
      expect(decodeGnomeCopiedFiles(encodeGnomeCopiedFiles(paths, mode))).toEqual({ paths, mode })
    }
  })

  it('gnome format encodes as "<mode>\\n<url>\\n<url>"', () => {
    expect(encodeGnomeCopiedFiles(['/a.txt'], 'cut')).toBe('cut\nfile:///a.txt')
  })

  it('gnome decode rejects an unknown mode line and an empty list', () => {
    expect(decodeGnomeCopiedFiles('nope\nfile:///a.txt')).toBeNull()
    expect(decodeGnomeCopiedFiles('copy\n')).toBeNull()
    expect(decodeGnomeCopiedFiles('')).toBeNull()
  })

  it('uri-list decode skips comments and non-file URLs, mode is copy', () => {
    expect(decodeUriList('# comment\r\nfile:///a%20b.txt\r\nhttp://x.y/z\r\nfile:///c.txt\r\n')).toEqual({
      paths: ['/a b.txt', '/c.txt'],
      mode: 'copy',
    })
    expect(decodeUriList('http://x.y/z')).toBeNull()
  })

  it('filenames plist decode reads every <string> and unescapes XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><array>
<string>/a/b &amp; c.txt</string>
<string>/d.txt</string>
</array></plist>`
    expect(decodeFilenamesPlist(xml)).toEqual({ paths: ['/a/b & c.txt', '/d.txt'], mode: 'copy' })
    expect(decodeFilenamesPlist('<plist><array></array></plist>')).toBeNull()
  })

  it('file-url decode handles a trailing NUL/newline and rejects non-file URLs', () => {
    expect(decodeFileUrl('file:///a%20b.txt\u0000')).toEqual({ paths: ['/a b.txt'], mode: 'copy' })
    expect(decodeFileUrl('file:///a.txt\n')).toEqual({ paths: ['/a.txt'], mode: 'copy' })
    expect(decodeFileUrl('http://x.y')).toBeNull()
    expect(decodeFileUrl('')).toBeNull()
  })
})
