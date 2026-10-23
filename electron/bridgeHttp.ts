import { Agent } from 'undici'

// How long a chat request may wait for the server, in ms. Node's fetch gives
// up after 300s without response headers (and 300s between body chunks), but
// a local model reading a long prompt cold — or a non-streamed compaction
// summary — can take longer than that, and the abort shows up only as
// "fetch failed". 0 = no limit.
export const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60_000

const agents = new Map<number, Agent>()

// One shared Agent per timeout value, so connections are pooled across requests.
export function requestDispatcher(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Agent {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.round(timeoutMs) : 0
  let agent = agents.get(ms)
  if (!agent) {
    agent = new Agent({ headersTimeout: ms, bodyTimeout: ms })
    agents.set(ms, agent)
  }
  return agent
}
