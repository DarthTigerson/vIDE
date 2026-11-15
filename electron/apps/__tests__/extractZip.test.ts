import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractZip } from '../extractZip'

let root: string
let dest: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'extract-'))
  dest = join(root, 'dest')
  mkdirSync(dest)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('extractZip', () => {
  it('extracts files and nested folders', () => {
    const icon = strToU8('<svg/>')
    extractZip(zipSync({ 'manifest.json': strToU8('{}'), 'assets/icon.svg': icon }), dest)
    expect(readFileSync(join(dest, 'manifest.json'), 'utf8')).toBe('{}')
    expect(Buffer.from(readFileSync(join(dest, 'assets/icon.svg')))).toEqual(Buffer.from(icon))
  })

  it('rejects ../ paths and writes nothing', () => {
    const zip = zipSync({ 'ok.txt': strToU8('ok'), '../evil.txt': strToU8('x') })
    expect(() => extractZip(zip, dest)).toThrow(/unsafe path/)
    expect(existsSync(join(root, 'evil.txt'))).toBe(false)
    expect(readdirSync(dest)).toEqual([])
  })

  it('rejects absolute paths', () => {
    expect(() => extractZip(zipSync({ '/tmp/x': strToU8('x') }), dest)).toThrow(/unsafe path/)
  })

  it('rejects backslash paths', () => {
    expect(() => extractZip(zipSync({ 'a\\..\\b': strToU8('x') }), dest)).toThrow(/unsafe path/)
  })

  it('rejects garbage bytes', () => {
    expect(() => extractZip(new Uint8Array([1, 2, 3, 4, 5]), dest)).toThrow(/bad zip/)
  })

  it('rejects zips over the size limit and writes nothing', () => {
    const zip = zipSync({ 'a.txt': new Uint8Array(600), 'b.txt': new Uint8Array(600) })
    expect(() => extractZip(zip, dest, { maxTotalBytes: 1000 })).toThrow(/bad zip: too large/)
    expect(readdirSync(dest)).toEqual([])
  })

  it('rejects zips with too many entries', () => {
    const zip = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') })
    expect(() => extractZip(zip, dest, { maxEntries: 1 })).toThrow(/bad zip: too large/)
  })
})
