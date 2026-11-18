import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { requestDispatcher } from '../bridgeHttp'

// The global (Node built-in) fetch on purpose: that is what bridge.ts and
// bridgeCompact.ts call, and it runs Node's bundled undici, not ours — the
// dispatcher has to work across that version gap.
const fetchWith = (url: string, dispatcher: ReturnType<typeof requestDispatcher>, init: RequestInit = {}) =>
  fetch(url, { ...init, dispatcher } as RequestInit)

// Answers after `delayMs`, the way llama-server holds a non-streamed reply
// until the whole completion is done.
function slowServer(delayMs: number): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    setTimeout(() => res.end('ok'), delayMs)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })
    })
  })
}

let server: Server | undefined
afterEach(() => {
  server?.closeAllConnections()
  server?.close()
  server = undefined
})

describe('requestDispatcher', () => {
  it('reuses one agent per timeout and treats 0 and negatives as no limit', () => {
    expect(requestDispatcher(1000)).toBe(requestDispatcher(1000))
    expect(requestDispatcher(0)).toBe(requestDispatcher(-5))
    expect(requestDispatcher()).toBe(requestDispatcher(10 * 60_000))
  })

  it('gives up once the server takes longer than the timeout to answer', async () => {
    // undici checks its timeouts on a coarse (~1s) tick, so leave a wide gap.
    const slow = await slowServer(3000)
    server = slow.server
    await expect(fetchWith(slow.url, requestDispatcher(200))).rejects.toThrow('fetch failed')
  })

  it('waits as long as it takes when the timeout is 0', async () => {
    const slow = await slowServer(400)
    server = slow.server
    const response = await fetchWith(slow.url, requestDispatcher(0))
    expect(await response.text()).toBe('ok')
  })

  it('streams a POST response body through the global fetch', async () => {
    const server2 = createServer((req, res) => {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        res.write(`got:${body};`)
        setTimeout(() => res.end('done'), 50)
      })
    })
    server = server2
    await new Promise<void>((r) => server2.listen(0, '127.0.0.1', () => r()))
    const url = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`
    const response = await fetchWith(url, requestDispatcher(5000), { method: 'POST', body: '{"a":1}' })
    expect(await response.text()).toBe('got:{"a":1};done')
  })

  it('still honours an abort signal', async () => {
    const slow = await slowServer(3000)
    server = slow.server
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 50)
    await expect(fetchWith(slow.url, requestDispatcher(0), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
