import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import type { AddressInfo } from 'net'
import { Agent, fetch } from 'undici'
import { SseUnmasker } from './sse'
import { GeminiUnmasker, OpenAiChatUnmasker, ResponsesUnmasker, type StreamUnmasker } from './streams'

// Local gateway between Claude Code and Anthropic. Hardening:
// - listens on 127.0.0.1 only, random port
// - every request needs the per-launch random token header
// - Host must be our own loopback address (blocks DNS rebinding)
// - any browser-style request (Origin / Sec-Fetch-*) is refused
// - forwards to a fixed upstream per route only, never follows redirects
// - strict TLS regardless of NODE_TLS_REJECT_UNAUTHORIZED
// - bodies and auth headers are never logged
// - if masking fails, the request is refused, never sent unmasked

export const UPSTREAM = 'https://api.anthropic.com'
export const TOKEN_HEADER = 'x-vcloak-token'

// Routes for tools that cannot send a custom header: the token travels in
// the path instead, /t/<token>/<route>/..., e.g. a base URL of
// http://127.0.0.1:<port>/t/<token>/openai/v1. Each route has one fixed
// upstream and one stream format.
export type GatewayRoute = 'anthropic' | 'openai' | 'chatgpt' | 'gemini' | 'codeassist'
export const ROUTE_UPSTREAMS: Record<GatewayRoute, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  chatgpt: 'https://chatgpt.com',
  gemini: 'https://generativelanguage.googleapis.com',
  codeassist: 'https://cloudcode-pa.googleapis.com',
}
const ROUTE_RE = /^\/t\/([0-9a-f]{64})\/(anthropic|openai|chatgpt|gemini|codeassist)(\/.*)?$/
const MAX_BODY = 64 * 1024 * 1024

const DROP_REQUEST_HEADERS = new Set([
  'host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding', 'keep-alive',
  'proxy-authorization', 'proxy-connection', 'te', 'upgrade', 'origin', 'referer', TOKEN_HEADER,
])
const DROP_RESPONSE_HEADERS = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'connection', 'keep-alive'])

export interface GatewayHooks {
  // Masks a parsed JSON request body; throws to block the request
  mask(body: unknown): unknown
  unmask(body: unknown): unknown
  unmaskText(text: string): string
  onRequest?(outcome: 'forwarded' | 'blocked'): void
  // Masking threw: local diagnostics only
  onMaskError?(err: unknown): void
}

export interface GatewayOptions {
  hooks: GatewayHooks
  // Tests only; production always uses UPSTREAM / ROUTE_UPSTREAMS
  upstream?: string
  routeUpstreams?: Partial<Record<GatewayRoute, string>>
  tlsRejectUnauthorized?: boolean
}

export class VcloakGateway {
  readonly token = randomBytes(32).toString('hex')
  private server: Server | null = null
  private port: number | null = null
  private readonly upstream: URL
  private readonly agent: Agent

  constructor(private opts: GatewayOptions) {
    this.upstream = new URL(opts.upstream ?? UPSTREAM)
    this.agent = new Agent({
      connect: { rejectUnauthorized: opts.tlsRejectUnauthorized ?? true },
      headersTimeout: 10 * 60_000,
      bodyTimeout: 0,
    })
  }

  get url(): string | null {
    return this.port === null ? null : `http://127.0.0.1:${this.port}`
  }

  // Base URL for a route with the token in the path, e.g. for OPENAI_BASE_URL
  routeUrl(route: GatewayRoute): string | null {
    return this.url === null ? null : `${this.url}/t/${this.token}/${route}`
  }

  private upstreamFor(route: GatewayRoute | null): URL {
    if (route === null) return this.upstream
    return new URL(this.opts.routeUpstreams?.[route] ?? ROUTE_UPSTREAMS[route])
  }

  // Splits /t/<token>/<route>/rest into its parts; null when not a route path
  private parseRoute(path: string): { token: string; route: GatewayRoute; rest: string } | null {
    const q = path.indexOf('?')
    const m = ROUTE_RE.exec(q >= 0 ? path.slice(0, q) : path)
    if (!m) return null
    return { token: m[1], route: m[2] as GatewayRoute, rest: (m[3] ?? '/') + (q >= 0 ? path.slice(q) : '') }
  }

  get listening(): boolean {
    return this.port !== null
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handle(req, res).catch(() => this.fail(res, 502, 'vCloak gateway error'))
      })
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        this.port = (server.address() as AddressInfo).port
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    if (server) await new Promise<void>((r) => server.close(() => r()))
  }

  private fail(res: ServerResponse, status: number, message: string): void {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'error', error: { type: 'vcloak_error', message } }))
  }

  // Returns an error message, or null when the request may proceed
  checkRequest(req: IncomingMessage): string | null {
    const addr = req.socket.remoteAddress ?? ''
    if (addr !== '127.0.0.1' && addr !== '::ffff:127.0.0.1') return 'loopback only'
    const host = req.headers.host
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return 'bad host'
    if (req.headers.origin !== undefined || Object.keys(req.headers).some((h) => h.startsWith('sec-fetch-'))) return 'browser requests refused'
    const path = req.url ?? ''
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\') || path.includes('@')) return 'bad path'
    const route = this.parseRoute(path)
    const given = route ? route.token : req.headers[TOKEN_HEADER]
    if (typeof given !== 'string' || given.length !== this.token.length) return 'missing token'
    if (!timingSafeEqual(Buffer.from(given), Buffer.from(this.token))) return 'bad token'
    if (!['GET', 'POST', 'HEAD'].includes(req.method ?? '')) return 'method not allowed'
    return null
  }

  private async readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY) throw new Error('body too large')
      chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const refused = this.checkRequest(req)
    if (refused) {
      this.opts.hooks.onRequest?.('blocked')
      return this.fail(res, refused === 'bad token' || refused === 'missing token' ? 401 : 403, `vCloak: ${refused}`)
    }

    let raw: Buffer
    try {
      raw = await this.readBody(req)
    } catch {
      this.opts.hooks.onRequest?.('blocked')
      return this.fail(res, 413, 'vCloak: request too large')
    }

    let body: Buffer | undefined
    if (raw.length > 0) {
      const type = String(req.headers['content-type'] ?? '')
      if (!type.includes('json')) {
        this.opts.hooks.onRequest?.('blocked')
        return this.fail(res, 415, 'vCloak: only JSON bodies are forwarded')
      }
      try {
        body = Buffer.from(JSON.stringify(this.opts.hooks.mask(JSON.parse(raw.toString('utf8')))))
      } catch (err) {
        this.opts.hooks.onRequest?.('blocked')
        this.opts.hooks.onMaskError?.(err)
        return this.fail(res, 400, 'vCloak blocked this request: it could not be masked safely')
      }
    }

    const route = this.parseRoute(req.url ?? '/')
    const upstreamBase = this.upstreamFor(route?.route ?? null)
    const target = new URL(route ? route.rest : req.url ?? '/', upstreamBase)
    if (target.origin !== upstreamBase.origin) {
      this.opts.hooks.onRequest?.('blocked')
      return this.fail(res, 403, 'vCloak: bad path')
    }

    const headers: Record<string, string> = { 'accept-encoding': 'identity' }
    for (const [k, v] of Object.entries(req.headers)) {
      if (DROP_REQUEST_HEADERS.has(k) || v === undefined) continue
      headers[k] = Array.isArray(v) ? v.join(', ') : v
    }

    const abort = new AbortController()
    res.on('close', () => abort.abort())
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      dispatcher: this.agent,
      signal: abort.signal,
    })
    this.opts.hooks.onRequest?.('forwarded')

    const outHeaders: Record<string, string> = {}
    upstream.headers.forEach((v, k) => {
      if (!DROP_RESPONSE_HEADERS.has(k)) outHeaders[k] = v
    })
    const type = upstream.headers.get('content-type') ?? ''

    if (type.includes('text/event-stream') && upstream.body) {
      res.writeHead(upstream.status, outHeaders)
      const sse = this.streamFor(route?.route ?? 'anthropic', target.pathname)
      const decoder = new TextDecoder()
      for await (const chunk of upstream.body) {
        const out = sse.push(decoder.decode(chunk as Uint8Array, { stream: true }))
        if (out) res.write(out)
      }
      const rest = sse.push(decoder.decode()) + sse.end()
      res.end(rest)
      return
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    let outBody = buf
    if (type.includes('json') && buf.length > 0) {
      try {
        outBody = Buffer.from(JSON.stringify(this.opts.hooks.unmask(JSON.parse(buf.toString('utf8')))))
      } catch {
        outBody = buf
      }
    }
    res.writeHead(upstream.status, outHeaders)
    res.end(outBody)
  }

  private streamFor(route: GatewayRoute, path: string): StreamUnmasker {
    const unmask = (s: string) => this.opts.hooks.unmaskText(s)
    switch (route) {
      case 'anthropic':
        return new SseUnmasker(unmask)
      case 'gemini':
      case 'codeassist':
        return new GeminiUnmasker(unmask)
      case 'chatgpt':
        return new ResponsesUnmasker(unmask)
      case 'openai':
        return /\/responses(\/|$)/.test(path) ? new ResponsesUnmasker(unmask) : new OpenAiChatUnmasker(unmask)
    }
  }
}
