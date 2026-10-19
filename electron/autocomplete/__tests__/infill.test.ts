import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { postProcessCompletion, probeCompletion, requestCompletion } from '../infill'

let server: http.Server
let baseUrl: string
let lastPath = ''
let lastBody: Record<string, unknown> = {}
let lastAuth: string | undefined
let reply: { status: number; body: unknown; delayMs?: number } = { status: 200, body: {} }

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      lastPath = req.url ?? ''
      lastAuth = req.headers.authorization
      lastBody = raw ? JSON.parse(raw) : {}
      setTimeout(() => {
        res.writeHead(reply.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(reply.body))
      }, reply.delayMs ?? 0)
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => { server.close() })
beforeEach(() => { reply = { status: 200, body: {} } })

describe('requestCompletion (llama.cpp /infill)', () => {
  it('posts the prefix and suffix to /infill with the bearer key', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl, apiKey: 'k' }, 'return ', '\n}')
    expect(lastPath).toBe('/infill')
    expect(lastAuth).toBe('Bearer k')
    expect(lastBody).toMatchObject({ input_prefix: 'return ', input_suffix: '\n}', n_predict: 64, cache_prompt: true })
  })

  it('keeps leading spaces in the completion', async () => {
    reply = { status: 200, body: { content: '  a + b' } }
    expect(await requestCompletion({ kind: 'infill', baseUrl }, 'return', '')).toBe('  a + b')
  })

  it('sends no Authorization header without a key', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl }, 'a', '')
    expect(lastAuth).toBeUndefined()
  })

  it('resolves null on a non-2xx response', async () => {
    reply = { status: 401, body: { error: 'Invalid API Key' } }
    expect(await requestCompletion({ kind: 'infill', baseUrl, apiKey: 'bad' }, 'a', '')).toBeNull()
  })

  it('resolves null when the request is aborted', async () => {
    reply = { status: 200, body: { content: 'late' }, delayMs: 200 }
    const controller = new AbortController()
    const p = requestCompletion({ kind: 'infill', baseUrl }, 'a', '', controller.signal)
    controller.abort()
    expect(await p).toBeNull()
  })

  it('resolves null when the server is unreachable', async () => {
    expect(await requestCompletion({ kind: 'infill', baseUrl: 'http://127.0.0.1:1' }, 'a', '')).toBeNull()
  })
})

describe('requestCompletion (OpenAI-compatible)', () => {
  it('posts prompt + suffix to /v1/completions and reads choices[0].text', async () => {
    reply = { status: 200, body: { choices: [{ text: 'x' }] } }
    expect(await requestCompletion({ kind: 'openai', baseUrl }, 'pre', 'suf')).toBe('x')
    expect(lastPath).toBe('/v1/completions')
    expect(lastBody).toMatchObject({ prompt: 'pre', suffix: 'suf', max_tokens: 64 })
  })
})

describe('postProcessCompletion', () => {
  it('keeps leading whitespace, which is part of a fill-in-the-middle answer', () => {
    expect(postProcessCompletion('\n  foo  \n')).toBe('\n  foo')
  })

  it('returns null for an empty or whitespace-only completion', () => {
    expect(postProcessCompletion('  \n ')).toBeNull()
  })

  it('returns null when the completion exceeds the max length', () => {
    expect(postProcessCompletion('x'.repeat(2001))).toBeNull()
  })
})

describe('probeCompletion (start-up readiness)', () => {
  it('counts an empty completion as ready: a FIM model may stop at once', async () => {
    reply = { status: 200, body: { content: '' } }
    expect(await probeCompletion({ kind: 'infill', baseUrl, apiKey: 'k' })).toEqual({ ok: true })
  })

  it("passes on the server's own error message", async () => {
    reply = { status: 501, body: { error: { code: 501, message: 'Infill is not supported by this model', type: 'not_supported_error' } } }
    expect(await probeCompletion({ kind: 'infill', baseUrl })).toEqual({ ok: false, message: 'Infill is not supported by this model' })
  })

  it('fails without a message when the body has none', async () => {
    reply = { status: 500, body: {} }
    expect(await probeCompletion({ kind: 'openai', baseUrl })).toEqual({ ok: false })
  })

  it('gives up after its timeout', async () => {
    reply = { status: 200, body: { content: 'x' }, delayMs: 500 }
    expect(await probeCompletion({ kind: 'infill', baseUrl }, 50)).toEqual({ ok: false, message: 'The model took too long to answer' })
  })
})
