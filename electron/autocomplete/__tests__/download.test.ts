import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadFile } from '../download'

const BODY = Buffer.alloc(1024 * 1024, 0).map((_, i) => i % 251)
let server: http.Server
let baseUrl: string
let lastRange: string | undefined
let slow = false

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastRange = req.headers.range
    const match = req.headers.range?.match(/^bytes=(\d+)-$/)
    const start = match ? Number(match[1]) : 0
    const chunk = BODY.subarray(start)
    res.writeHead(match ? 206 : 200, { 'Content-Length': chunk.length })
    if (slow) {
      res.write(chunk.subarray(0, 1024))
      return // never finishes; the test aborts
    }
    res.end(chunk)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/file`
})

afterAll(() => { server.close() })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vide-dl-'))
  lastRange = undefined
  slow = false
})

describe('downloadFile', () => {
  it('creates the destination folder on a first download', async () => {
    const dest = join(dir, 'autocomplete', 'models', 'model.gguf')
    await downloadFile(baseUrl, dest, { expectedBytes: BODY.length })
    expect(statSync(dest).size).toBe(BODY.length)
  })

  it('downloads the whole file, renames it into place and reports final progress', async () => {
    const dest = join(dir, 'model.gguf')
    const progress: [number, number][] = []
    await downloadFile(baseUrl, dest, { expectedBytes: BODY.length, onProgress: (r, t) => progress.push([r, t]) })
    expect(readFileSync(dest).equals(BODY)).toBe(true)
    expect(existsSync(dest + '.part')).toBe(false)
    expect(progress.at(-1)).toEqual([BODY.length, BODY.length])
  })

  it('resumes from an existing .part file with a Range request', async () => {
    const dest = join(dir, 'model.gguf')
    writeFileSync(dest + '.part', BODY.subarray(0, 262144))
    await downloadFile(baseUrl, dest, { expectedBytes: BODY.length })
    expect(lastRange).toBe('bytes=262144-')
    expect(readFileSync(dest).equals(BODY)).toBe(true)
  })

  it('rejects and leaves no file in place when the size does not match', async () => {
    const dest = join(dir, 'model.gguf')
    await expect(downloadFile(baseUrl, dest, { expectedBytes: BODY.length + 1 })).rejects.toThrow()
    expect(existsSync(dest)).toBe(false)
  })

  it('rejects on abort and keeps the partial file for a later resume', async () => {
    slow = true
    const dest = join(dir, 'model.gguf')
    const controller = new AbortController()
    const p = downloadFile(baseUrl, dest, {
      expectedBytes: BODY.length,
      signal: controller.signal,
      // Give the first chunk time to reach disk before cancelling.
      onProgress: () => { setTimeout(() => controller.abort(), 50) },
    })
    await expect(p).rejects.toThrow()
    expect(existsSync(dest)).toBe(false)
    expect(statSync(dest + '.part').size).toBeGreaterThan(0)
  })
})
