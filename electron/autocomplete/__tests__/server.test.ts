import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LlamaServerProcess, buildServerArgs, freePort } from '../server'

describe('buildServerArgs', () => {
  const base = { modelPath: '/m.gguf', port: 4321, apiKey: 'k' }

  it('builds the tuned FIM args with Metal offload on macOS', () => {
    expect(buildServerArgs({ ...base, platform: 'darwin' })).toEqual([
      '-m', '/m.gguf', '--host', '127.0.0.1', '--port', '4321', '--api-key', 'k',
      '-np', '1', '-ub', '1024', '-b', '1024', '-c', '8192', '--cache-reuse', '256', '-cram', '256', '--no-webui',
      '-ngl', '99',
    ])
  })

  it('leaves out GPU offload on Linux (CPU build)', () => {
    expect(buildServerArgs({ ...base, platform: 'linux' })).not.toContain('-ngl')
  })

  it("appends the user's extra flags last", () => {
    expect(buildServerArgs({ ...base, platform: 'linux', extraArgs: ['-t', '4'] }).slice(-2)).toEqual(['-t', '4'])
  })
})

// A stand-in llama-server: answers /health, and /infill either properly or
// with the 500 a real server gives when Metal runs out of memory.
const STUB = `
const http = require('http')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
const mode = process.argv[process.argv.length - 1]
process.stderr.write('loading model\\n')
http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('{"status":"ok"}') }
  if (mode === 'broken') {
    process.stderr.write('error: Insufficient Memory (kIOGPUCommandBufferCallbackErrorOutOfMemory)\\n')
    res.writeHead(500); return res.end('{}')
  }
  if (mode === 'nofim') {
    process.stderr.write('srv  log_server_r: request error\\n')
    res.writeHead(501, { 'Content-Type': 'application/json' })
    return res.end('{"error":{"code":501,"message":"Infill is not supported by this model","type":"not_supported_error"}}')
  }
  if (mode === 'empty') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"content":""}') }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"content":" 1"}')
}).listen(port, '127.0.0.1')
`

let stubPath: string
beforeAll(() => {
  stubPath = join(mkdtempSync(join(tmpdir(), 'vide-stub-')), 'stub.cjs')
  writeFileSync(stubPath, STUB)
})

let proc: LlamaServerProcess | null = null
afterEach(() => { proc?.stop(); proc = null })

describe('LlamaServerProcess', () => {
  it('resolves once /health and a probe completion both succeed', async () => {
    const port = await freePort()
    proc = new LlamaServerProcess()
    await proc.start(process.execPath, [stubPath, '--port', String(port), 'ok'], port, 'k')
    expect(typeof proc.pid).toBe('number')
  })

  it("rejects with the server's error and kills it when the probe fails", async () => {
    const port = await freePort()
    proc = new LlamaServerProcess()
    await expect(proc.start(process.execPath, [stubPath, '--port', String(port), 'broken'], port, 'k'))
      .rejects.toThrow(/Insufficient Memory/)
    expect(proc.pid).toBeNull()
  })

  it('accepts a model whose probe completion comes back empty', async () => {
    const port = await freePort()
    proc = new LlamaServerProcess()
    await proc.start(process.execPath, [stubPath, '--port', String(port), 'empty'], port, 'k')
    expect(typeof proc.pid).toBe('number')
  })

  it("prefers the server's answer over its log for a model that can't fill in the middle", async () => {
    const port = await freePort()
    proc = new LlamaServerProcess()
    await expect(proc.start(process.execPath, [stubPath, '--port', String(port), 'nofim'], port, 'k'))
      .rejects.toThrow('Infill is not supported by this model')
  })

  it('rejects when the binary exits before becoming ready', async () => {
    const port = await freePort()
    proc = new LlamaServerProcess()
    await expect(proc.start(process.execPath, ['-e', 'process.exit(3)'], port, 'k', { readyTimeoutMs: 5000 }))
      .rejects.toThrow()
    expect(proc.pid).toBeNull()
  })
})
