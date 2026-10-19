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
    await requestCompletion({ kind: 'infill', baseUrl, apiKey: 'k' }, { prefix: 'return ', suffix: '\n}' })
    expect(lastPath).toBe('/infill')
    expect(lastAuth).toBe('Bearer k')
    expect(lastBody).toMatchObject({ input_prefix: 'return ', input_suffix: '\n}', cache_prompt: true })
  })

  it('keeps leading spaces in the completion', async () => {
    reply = { status: 200, body: { content: '  a + b' } }
    expect(await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'return', suffix: '' })).toBe('  a + b')
  })

  it('sends no Authorization header without a key', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'a', suffix: '' })
    expect(lastAuth).toBeUndefined()
  })

  it('resolves null on a non-2xx response', async () => {
    reply = { status: 401, body: { error: 'Invalid API Key' } }
    expect(await requestCompletion({ kind: 'infill', baseUrl, apiKey: 'bad' }, { prefix: 'a', suffix: '' })).toBeNull()
  })

  it('resolves null when the request is aborted', async () => {
    reply = { status: 200, body: { content: 'late' }, delayMs: 200 }
    const controller = new AbortController()
    const p = requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'a', suffix: '' }, controller.signal)
    controller.abort()
    expect(await p).toBeNull()
  })

  it('resolves null when the server is unreachable', async () => {
    expect(await requestCompletion({ kind: 'infill', baseUrl: 'http://127.0.0.1:1' }, { prefix: 'a', suffix: '' })).toBeNull()
  })
})

describe('requestCompletion: line and block mode', () => {
  it('finishes just the current line when the cursor is mid-statement', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'const a = foo(', suffix: ')\n' })
    expect(lastBody.stop).toEqual(['\n'])
    expect(lastBody.n_indent).toBeUndefined()
  })

  it('allows a block on a fresh line, ending where the indentation drops back', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'if (a) {\n    ', suffix: '\n}' })
    expect(lastBody.n_indent).toBe(4)
    expect(lastBody.stop).toEqual(['\n\n'])
  })

  it('decodes greedily: the most likely code, not a random pick', async () => {
    reply = { status: 200, body: { content: 'x' } }
    await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'a', suffix: '' })
    expect(lastBody.temperature).toBe(0)
  })

  it('sends other files as input_extra', async () => {
    reply = { status: 200, body: { content: 'x' } }
    const extra = [{ filename: 'src/a.ts', text: 'export const A = 1' }]
    await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'A', suffix: '', extra })
    expect(lastBody.input_extra).toEqual(extra)
  })

  it('trims a closer the completion repeats from right after the cursor', async () => {
    reply = { status: 200, body: { content: 'win.id)' } }
    expect(await requestCompletion({ kind: 'infill', baseUrl }, { prefix: 'close(', suffix: ')\n' })).toBe('win.id')
  })
})

describe('requestCompletion (OpenAI-compatible)', () => {
  it('posts prompt + suffix to /v1/completions and reads choices[0].text', async () => {
    reply = { status: 200, body: { choices: [{ text: 'x' }] } }
    expect(await requestCompletion({ kind: 'openai', baseUrl }, { prefix: 'pre', suffix: 'suf' })).toBe('x')
    expect(lastPath).toBe('/v1/completions')
    expect(lastBody).toMatchObject({ prompt: 'pre', suffix: 'suf' })
  })
})

describe('postProcessCompletion', () => {
  const at = (prefix = '', suffix = '') => ({ prefix, suffix })

  it('keeps leading whitespace, which is part of a fill-in-the-middle answer', () => {
    expect(postProcessCompletion('\n  foo  \n', at())).toBe('\n  foo')
  })

  it('returns null for an empty or whitespace-only completion', () => {
    expect(postProcessCompletion('  \n ', at())).toBeNull()
  })

  it('returns null when the completion exceeds the max length', () => {
    expect(postProcessCompletion('x'.repeat(2001), at())).toBeNull()
  })

  it("drops the end of the line it would duplicate (Monaco's auto-closed brackets)", () => {
    expect(postProcessCompletion('a, b)', at('f(', ')'))).toBe('a, b')
    expect(postProcessCompletion("x, y])", at('g([', '])\nnext'))).toBe('x, y')
  })

  it('drops trailing lines that repeat what already follows the cursor', () => {
    expect(postProcessCompletion('  run()\n}', at('if (a) {\n', '\n}\nmore'))).toBe('  run()')
  })

  it('shows nothing when the suggestion only repeats what is already there', () => {
    expect(postProcessCompletion(')', at('f(', ')'))).toBeNull()
  })

  it('shows nothing when it just repeats the line above', () => {
    expect(postProcessCompletion('doThing(a)', at('  doThing(a)\n  ', ''))).toBeNull()
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
