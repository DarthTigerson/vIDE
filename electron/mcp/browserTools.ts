import { request } from 'http'
import type { McpToolDef, McpToolImageResult } from './protocol'

interface RawResponse {
  status: number
  buffer: Buffer
  headers: Record<string, string | string[] | undefined>
}

function postRaw(socketPath: string, windowId: string, path: string, body: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path,
        method: 'POST',
        headers: { 'X-Vide-Window-Id': windowId, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(chunks), headers: res.headers }))
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

// Every route the bridge exposes reports failure the same way: non-2xx with
// a `{ error: string }` JSON body (or, worst case, a raw connection error —
// e.g. the socket doesn't exist yet because vIDE hasn't started this
// window's bridge server). Surface either as a plain thrown Error so it
// reaches the model as normal tool-call failure text.
async function call(socketPath: string, windowId: string, path: string, params: Record<string, string> = {}): Promise<RawResponse> {
  const body = new URLSearchParams(params).toString()
  let res: RawResponse
  try {
    res = await postRaw(socketPath, windowId, path, body)
  } catch (err) {
    throw new Error(
      `Could not reach vIDE's browser bridge (${err instanceof Error ? err.message : String(err)}). ` +
        `Is vIDE running, with this window still open?`
    )
  }
  if (res.status >= 400) {
    let message = res.buffer.toString('utf8')
    try {
      message = JSON.parse(message).error ?? message
    } catch {
      // not JSON — use the raw body as-is
    }
    throw new Error(message)
  }
  return res
}

async function callJson(socketPath: string, windowId: string, path: string, params?: Record<string, string>): Promise<any> {
  const res = await call(socketPath, windowId, path, params)
  return JSON.parse(res.buffer.toString('utf8'))
}

export function buildBrowserTools(socketPath: string, windowId: string): McpToolDef[] {
  return [
    {
      name: 'browser_navigate',
      description:
        "Navigate vIDE's dedicated Claude-controlled browser tab to a URL. This is a single tab reserved " +
        "for Claude — separate from any tab the user has open themselves — created automatically on first " +
        'use. Call this before screenshot/click/type/read_console_logs/read_page_text.',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
      handler: async (args) => {
        await callJson(socketPath, windowId, '/navigate', { url: String(args.url) })
        return `Navigated to ${String(args.url)}`
      },
    },
    {
      name: 'browser_screenshot',
      description:
        'Take a screenshot of the current page in the Claude-controlled browser tab. Use this to see the ' +
        'page before deciding where to click.',
      inputSchema: { type: 'object', properties: {} },
      handler: async (): Promise<McpToolImageResult> => {
        const res = await call(socketPath, windowId, '/screenshot')
        return {
          // Diagnostic (VIDE-53): a live test found click coordinates read
          // off the screenshot silently missing their target. Surfacing the
          // image's own pixel size vs. the view's logical bounds directly in
          // the tool response, so a mismatch (or lack of one) is visible
          // without guessing — if these two ever differ, that ratio is
          // exactly the factor click coordinates need to be scaled by.
          text: `Image size: ${res.headers['x-vide-image-size'] ?? 'unknown'}, page view size: ${res.headers['x-vide-view-bounds'] ?? 'unknown'} (these should match — if not, scale click/type coordinates by the ratio between them)`,
          image: { data: res.buffer.toString('base64'), mimeType: 'image/png' },
        }
      },
    },
    {
      name: 'browser_click',
      description:
        'Click the Claude-controlled browser tab at pixel coordinates (x, y), measured from the top-left of ' +
        'the page. Take a screenshot first to find the right coordinates.',
      inputSchema: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
      },
      handler: async (args) => {
        const { activeElement } = await callJson(socketPath, windowId, '/click', { x: String(args.x), y: String(args.y) })
        return `Clicked at (${args.x}, ${args.y}). Focused element afterward: ${activeElement}`
      },
    },
    {
      name: 'browser_type',
      description:
        'Type text into whatever element is currently focused in the Claude-controlled browser tab (click it ' +
        'first if nothing is focused yet).',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      handler: async (args) => {
        await callJson(socketPath, windowId, '/type', { text: String(args.text) })
        return `Typed ${String(args.text).length} character(s)`
      },
    },
    {
      name: 'browser_read_console_logs',
      description:
        "Read the Claude-controlled browser tab's buffered console messages (most recent 200), oldest first. " +
        'Useful for spotting JS errors or debug logging without a screenshot.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { logs } = await callJson(socketPath, windowId, '/console-logs')
        return logs.length ? logs.join('\n') : 'No console messages yet.'
      },
    },
    {
      name: 'browser_read_page_text',
      description:
        "Read the Claude-controlled browser tab's visible page text (document.body.innerText). Faster than a " +
        'screenshot for finding specific text or checking page content.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { text } = await callJson(socketPath, windowId, '/read-text')
        return text || '(empty page)'
      },
    },
    {
      name: 'browser_get_html',
      description:
        "Read the Claude-controlled browser tab's full HTML source (document.documentElement.outerHTML). " +
        'Useful for inspecting the DOM structure, finding CSS selectors, or extracting data that ' +
        'innerText would strip out.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { html } = await callJson(socketPath, windowId, '/read-html')
        return html || '(empty page)'
      },
    },
    {
      name: 'browser_evaluate',
      description:
        'Run a JavaScript expression in the Claude-controlled browser tab and return the result. ' +
        'Use for anything that needs direct DOM access: reading attribute values, checking element ' +
        'state, extracting structured data, triggering JS events, etc. ' +
        'The expression is evaluated with executeJavaScript — wrap multi-line logic in an IIFE if needed.',
      inputSchema: {
        type: 'object',
        properties: { script: { type: 'string', description: 'JS expression or IIFE to evaluate' } },
        required: ['script'],
      },
      handler: async (args) => {
        const { result } = await callJson(socketPath, windowId, '/evaluate', { script: String(args.script) })
        return result === undefined ? '(undefined)' : JSON.stringify(result, null, 2)
      },
    },
    {
      name: 'browser_get_network_log',
      description:
        "Read the Claude-controlled browser tab's captured network requests (up to the last 100), " +
        'oldest first. Shows URL, HTTP method, response status code, and resource type (XHR, Fetch, ' +
        'Document, Script, etc.). Useful for discovering what API calls a page is making. ' +
        'Pass clear=true to flush the log after reading.',
      inputSchema: {
        type: 'object',
        properties: {
          clear: { type: 'boolean', description: 'Flush the log after reading (default false)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.clear) params.clear = '1'
        const { log } = await callJson(socketPath, windowId, '/network-log', params)
        if (!log.length) return 'No network requests captured yet.'
        return (log as Array<{ method: string; status: number; type: string; url: string; startedAt: number }>)
          .map((e) => `[${e.method} ${e.status}] [${e.type}] ${e.url}`)
          .join('\n')
      },
    },
  ]
}
