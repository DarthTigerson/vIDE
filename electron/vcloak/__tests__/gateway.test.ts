import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, request, type Server } from 'http'
import type { AddressInfo } from 'net'
import { VcloakGateway, TOKEN_HEADER, type GatewayHooks } from '../gateway'

interface Seen {
  path: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

let upstream: Server
let upstreamUrl: string
let seen: Seen[]
let reply: (path: string) => { type: string; body: string }

const hooks: GatewayHooks = {
  mask: (b) => JSON.parse(JSON.stringify(b).replaceAll('secret-repo', 'pmasked')),
  unmask: (b) => JSON.parse(JSON.stringify(b).replaceAll('pmasked', 'secret-repo')),
  unmaskText: (s) => s.replaceAll('pmasked', 'secret-repo'),
}

function send(gw: VcloakGateway, opts: { path?: string; method?: string; headers?: Record<string, string>; body?: string }) {
  const port = Number(new URL(gw.url!).port)
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, path: opts.path ?? '/v1/messages', method: opts.method ?? 'POST',
      headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', [TOKEN_HEADER]: gw.token, ...opts.headers },
    }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', reject)
    req.end(opts.body)
  })
}

beforeEach(async () => {
  seen = []
  reply = () => ({ type: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'about pmasked' }] }) })
  upstream = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ path: req.url ?? '', headers: req.headers, body })
      const r = reply(req.url ?? '')
      res.writeHead(200, { 'content-type': r.type })
      res.end(r.body)
    })
  })
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()))
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((r) => upstream.close(() => r()))
})

async function gateway(h: GatewayHooks = hooks) {
  const gw = new VcloakGateway({ hooks: h, upstream: upstreamUrl })
  await gw.start()
  return gw
}

describe('vCloak gateway', () => {
  it('listens on loopback with a random token', async () => {
    const gw = await gateway()
    expect(gw.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(gw.token).toMatch(/^[0-9a-f]{64}$/)
    await gw.stop()
  })

  it('masks the request, strips the token and unmasks the reply', async () => {
    const gw = await gateway()
    const r = await send(gw, { body: JSON.stringify({ messages: [{ role: 'user', content: 'open secret-repo' }] }), headers: { authorization: 'Bearer abc' } })
    expect(r.status).toBe(200)
    expect(seen[0].body).toContain('pmasked')
    expect(seen[0].body).not.toContain('secret-repo')
    expect(seen[0].headers[TOKEN_HEADER]).toBeUndefined()
    expect(seen[0].headers.authorization).toBe('Bearer abc')
    expect(r.body).toContain('about secret-repo')
    await gw.stop()
  })

  it('unmasks streamed replies', async () => {
    reply = () => ({
      type: 'text/event-stream',
      body:
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"in pmasked now"}}\n\n' +
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    })
    const gw = await gateway()
    const r = await send(gw, { body: '{}' })
    expect(r.body).toContain('in secret-repo ')
    expect(r.body).toContain('"text":"now"')
    expect(r.body).not.toContain('pmasked')
    await gw.stop()
  })

  it.each([
    ['no token', { [TOKEN_HEADER]: '' }, 401],
    ['wrong token', { [TOKEN_HEADER]: 'f'.repeat(64) }, 401],
    ['foreign host (DNS rebinding)', { host: 'evil.example:80' }, 403],
    ['browser origin', { origin: 'https://evil.example' }, 403],
    ['browser fetch metadata', { 'sec-fetch-mode': 'cors' }, 403],
  ])('refuses %s', async (_name, headers, status) => {
    const gw = await gateway()
    const r = await send(gw, { headers: headers as Record<string, string>, body: '{}' })
    expect(r.status).toBe(status)
    expect(seen).toHaveLength(0)
    await gw.stop()
  })

  it.each(['//evil.example/x', '/v1/../../etc', '/@evil.example/'])('refuses path %s', async (path) => {
    const gw = await gateway()
    const r = await send(gw, { path, body: '{}' })
    expect(r.status).toBe(403)
    expect(seen).toHaveLength(0)
    await gw.stop()
  })

  it('refuses other methods and non-JSON bodies', async () => {
    const gw = await gateway()
    expect((await send(gw, { method: 'DELETE' })).status).toBe(403)
    expect((await send(gw, { headers: { 'content-type': 'text/plain' }, body: 'secret-repo' })).status).toBe(415)
    expect(seen).toHaveLength(0)
    await gw.stop()
  })

  it('fails closed when masking throws', async () => {
    const outcomes: string[] = []
    const gw = await gateway({ ...hooks, mask: () => { throw new Error('leak') }, onRequest: (o) => outcomes.push(o) })
    const r = await send(gw, { body: JSON.stringify({ messages: [{ content: 'secret-repo' }] }) })
    expect(r.status).toBe(400)
    expect(r.body).toContain('could not be masked')
    expect(seen).toHaveLength(0)
    expect(outcomes).toEqual(['blocked'])
    await gw.stop()
  })

  it('refuses unparseable JSON instead of forwarding it', async () => {
    const gw = await gateway()
    const r = await send(gw, { body: '{"broken": secret-repo' })
    expect(r.status).toBe(400)
    expect(seen).toHaveLength(0)
    await gw.stop()
  })

  it('keeps the query string and forwards GET without a body', async () => {
    const gw = await gateway()
    await send(gw, { method: 'GET', path: '/v1/models?limit=5' })
    expect(seen[0].path).toBe('/v1/models?limit=5')
    await gw.stop()
  })
})

describe('vCloak gateway routes (token in path)', () => {
  async function routed() {
    const all = { anthropic: upstreamUrl, openai: upstreamUrl, chatgpt: upstreamUrl, gemini: upstreamUrl, codeassist: upstreamUrl }
    const gw = new VcloakGateway({ hooks, upstream: upstreamUrl, routeUpstreams: all })
    await gw.start()
    return gw
  }
  const noHeader = { [TOKEN_HEADER]: '' }

  it('gives a route base URL with the token in the path', async () => {
    const gw = await routed()
    expect(gw.routeUrl('openai')).toBe(`${gw.url}/t/${gw.token}/openai`)
    await gw.stop()
  })

  it('forwards an OpenAI chat stream with the route prefix stripped and unmasks it', async () => {
    const gw = await routed()
    reply = () => ({ type: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'in pmasked' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` })
    const r = await send(gw, { path: `/t/${gw.token}/openai/v1/chat/completions`, headers: noHeader, body: JSON.stringify({ messages: [{ role: 'user', content: 'secret-repo' }], stream: true }) })
    expect(r.status).toBe(200)
    expect(seen[0].path).toBe('/v1/chat/completions')
    expect(seen[0].body).toContain('pmasked')
    expect(r.body).toContain('in secret-repo')
    expect(r.body).not.toContain('pmasked')
    await gw.stop()
  })

  it('keeps the query string and unmasks a Code Assist stream', async () => {
    const gw = await routed()
    reply = () => ({ type: 'text/event-stream', body: `data: ${JSON.stringify({ response: { candidates: [{ index: 0, content: { parts: [{ text: 'pmasked' }] }, finishReason: 'STOP' }] } })}\n\n` })
    const r = await send(gw, { path: `/t/${gw.token}/codeassist/v1internal:streamGenerateContent?alt=sse`, headers: noHeader, body: JSON.stringify({ request: { contents: [{ parts: [{ text: 'secret-repo' }] }] } }) })
    expect(seen[0].path).toBe('/v1internal:streamGenerateContent?alt=sse')
    expect(r.body).toContain('secret-repo')
    await gw.stop()
  })

  it('uses the Responses unmasker for /responses paths', async () => {
    const gw = await routed()
    reply = () => ({ type: 'text/event-stream', body: `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', item_id: 'i', delta: 'pmasked ok' })}\n\n` })
    const r = await send(gw, { path: `/t/${gw.token}/chatgpt/backend-api/codex/responses`, headers: noHeader, body: '{}' })
    const deltas = r.body.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)).delta).join('')
    expect(deltas).toBe('secret-repo ok')
    await gw.stop()
  })

  it('refuses a wrong path token, an unknown route and a missing token', async () => {
    const gw = await routed()
    const bad = 'f'.repeat(64)
    expect((await send(gw, { path: `/t/${bad}/openai/v1/models`, method: 'GET', headers: noHeader })).status).toBe(401)
    expect((await send(gw, { path: `/t/${gw.token}/evil/v1/models`, method: 'GET', headers: noHeader })).status).toBe(401)
    expect((await send(gw, { path: '/v1/models', method: 'GET', headers: noHeader })).status).toBe(401)
    expect(seen).toHaveLength(0)
    await gw.stop()
  })
})
