import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { fetch } from 'undici'
import { requestDispatcher } from '../bridgeHttp'

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
    await expect(fetch(slow.url, { dispatcher: requestDispatcher(200) })).rejects.toThrow('fetch failed')
  })

  it('waits as long as it takes when the timeout is 0', async () => {
    const slow = await slowServer(400)
    server = slow.server
    const response = await fetch(slow.url, { dispatcher: requestDispatcher(0) })
    expect(await response.text()).toBe('ok')
  })
})
