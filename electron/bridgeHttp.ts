import { Agent, Dispatcher1Wrapper, type Dispatcher } from 'undici'

// How long a chat request may wait for the server, in ms. Node's fetch gives
// up after 300s without response headers (and 300s between body chunks), but
// a local model reading a long prompt cold — or a non-streamed compaction
// summary — can take longer than that, and the abort shows up only as
// "fetch failed". 0 = no limit.
export const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60_000

const agents = new Map<number, Dispatcher>()

// One shared Agent per timeout value, so connections are pooled across requests.
// The callers hand this to Node's built-in fetch, which runs Node's own bundled
// undici (v7 in Node 24) and still drives dispatchers with the legacy handler
// callbacks; undici 8's Agent only speaks the new handler API, so a bare Agent
// fails every request with "invalid onRequestStart method". Dispatcher1Wrapper
// bridges the two (and passes new-style handlers through unchanged, so it keeps
// working once Node bundles undici 8). It also forces HTTP/1.1, as undici 6 did.
export function requestDispatcher(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Dispatcher {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : 0
  let agent = agents.get(ms)
  if (!agent) {
    agent = new Dispatcher1Wrapper(new Agent({ headersTimeout: ms, bodyTimeout: ms }))
    agents.set(ms, agent)
  }
  return agent
}
