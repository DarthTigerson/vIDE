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
      name: 'browser_list_tabs',
      description:
        "List all browser tabs the user currently has open in vIDE's browser panel, along with the " +
        'currently active tab (the one Claude is targeting). Use this to find a tab the user has ' +
        'already navigated and logged into, then call browser_use_tab to take it over — so Claude ' +
        'can continue from the existing session without starting over.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { tabs, activeTabId } = await callJson(socketPath, windowId, '/list-tabs')
        const list = tabs as Array<{ id: string; url: string; title: string }>
        if (!list.length) return `No user tabs open. Active target: ${activeTabId as string}`
        const lines = list.map((t) => `id: ${t.id}\n  title: ${t.title}\n  url:   ${t.url}`)
        return `Active target: ${activeTabId as string}\n\nOpen user tabs:\n${lines.join('\n\n')}`
      },
    },
    {
      name: 'browser_use_tab',
      description:
        'Switch Claude to controlling a specific user-open browser tab (from browser_list_tabs). ' +
        'All subsequent browser tool calls will operate on that tab instead of the dedicated Claude tab. ' +
        'Use this when the user has already navigated to a page and logged in — Claude can take over ' +
        'and continue from that point without losing the session.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Tab ID from browser_list_tabs' },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const { activeTabId } = await callJson(socketPath, windowId, '/use-tab', { id: String(args.id) })
        return `Now controlling tab: ${activeTabId as string}`
      },
    },
    {
      name: 'browser_release_tab',
      description:
        "Return Claude's browser control back to the dedicated Claude-only tab, releasing any user tab " +
        'previously taken over with browser_use_tab.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        await callJson(socketPath, windowId, '/release-tab')
        return 'Returned to dedicated Claude-controlled tab.'
      },
    },
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
      name: 'browser_wait_for_load',
      description:
        'Wait until the Claude-controlled browser tab finishes loading (the did-stop-loading event). ' +
        'Call this after browser_navigate or browser_click when the action triggers a page navigation, ' +
        'before taking a screenshot or reading page content. Returns immediately if the page is already idle. ' +
        'Default timeout is 10 seconds.',
      inputSchema: {
        type: 'object',
        properties: {
          timeout: { type: 'number', description: 'Max milliseconds to wait (default 10000)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.timeout != null) params.timeout = String(args.timeout)
        await callJson(socketPath, windowId, '/wait-for-load', params)
        return 'Page finished loading.'
      },
    },
    {
      name: 'browser_wait_for_selector',
      description:
        'Wait until a CSS selector appears in the DOM of the Claude-controlled browser tab. ' +
        'Use this after triggering an action that dynamically inserts content (infinite scroll load, ' +
        'SPA route change, async form submission) before trying to interact with the new elements. ' +
        'Polls every 250ms. Default timeout is 10 seconds.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeout: { type: 'number', description: 'Max milliseconds to wait (default 10000)' },
        },
        required: ['selector'],
      },
      handler: async (args) => {
        const params: Record<string, string> = { selector: String(args.selector) }
        if (args.timeout != null) params.timeout = String(args.timeout)
        await callJson(socketPath, windowId, '/wait-for-selector', params)
        return `Selector "${String(args.selector)}" found.`
      },
    },
    {
      name: 'browser_find_element',
      description:
        'Find an element in the Claude-controlled browser tab by CSS selector or visible text, ' +
        'scroll it into view, and return its centre pixel coordinates ready to pass to browser_click. ' +
        'Use this instead of guessing coordinates from a screenshot. ' +
        'Provide selector (e.g. "#submit", "button.primary") OR text (e.g. "Sign in") — not both.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to locate the element' },
          text: { type: 'string', description: 'Visible text the element must contain (case-insensitive)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.selector) params.selector = String(args.selector)
        if (args.text) params.text = String(args.text)
        const { x, y, tag, description } = await callJson(socketPath, windowId, '/find-element', params)
        return `Found ${tag as string} "${description as string}" at (${x as number}, ${y as number}) — pass these coordinates to browser_click.`
      },
    },
    {
      name: 'browser_get_url',
      description: 'Return the current URL of the Claude-controlled browser tab. Useful after navigations, ' +
        'redirects, or OAuth flows to confirm where the browser actually ended up.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { url } = await callJson(socketPath, windowId, '/get-url')
        return url as string
      },
    },
    {
      name: 'browser_scroll',
      description:
        'Scroll the Claude-controlled browser tab. Provide a CSS selector to scroll that element into view, ' +
        'or provide x/y pixel deltas to scroll the page by that amount (positive y scrolls down). ' +
        'Use this to reach lazy-loaded content or elements below the fold before clicking or screenshotting.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to scroll into view (takes priority over x/y)' },
          x: { type: 'number', description: 'Horizontal scroll delta in pixels (default 0)' },
          y: { type: 'number', description: 'Vertical scroll delta in pixels, positive = down (default 0)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.selector) params.selector = String(args.selector)
        if (args.x != null) params.x = String(args.x)
        if (args.y != null) params.y = String(args.y)
        await callJson(socketPath, windowId, '/scroll', params)
        return args.selector ? `Scrolled "${String(args.selector)}" into view` : `Scrolled by (${args.x ?? 0}, ${args.y ?? 0})`
      },
    },
    {
      name: 'browser_key_press',
      description:
        'Press a keyboard key in the Claude-controlled browser tab. Use this to submit forms (Enter), ' +
        'move focus between fields (Tab), dismiss dialogs (Escape), navigate lists (ArrowUp/ArrowDown), etc. ' +
        'Common keys: Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ' +
        'Backspace, Delete, Space, Home, End, PageUp, PageDown.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Key name, e.g. "Enter", "Tab", "Escape", "ArrowDown"' } },
        required: ['key'],
      },
      handler: async (args) => {
        await callJson(socketPath, windowId, '/key-press', { key: String(args.key) })
        return `Pressed ${String(args.key)}`
      },
    },
    {
      name: 'browser_save_html',
      description:
        "Save the Claude-controlled browser tab's full HTML source to a file on disk and return the path. " +
        'Useful for archiving a scraped page or opening it in an external tool. ' +
        'Optionally supply a path; defaults to a timestamped file in the system temp directory.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path to save to (optional)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.path) params.path = String(args.path)
        const { path } = await callJson(socketPath, windowId, '/save-html', params)
        return `HTML saved to ${path as string}`
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
      name: 'browser_get_response_body',
      description:
        'Fetch the raw response body of a previously captured network request by matching a URL substring ' +
        'against the network log. Use browser_get_network_log first to see what requests are available, ' +
        'then call this with enough of the URL to uniquely identify the request (e.g. "/api/data", "search?q="). ' +
        'Returns the most recent matching request. Ideal for reading API JSON responses without parsing the DOM. ' +
        'Note: cached responses and streaming responses are not available.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Substring of the request URL to match (case-sensitive)' },
        },
        required: ['url'],
      },
      handler: async (args) => {
        const { body, base64Encoded } = await callJson(socketPath, windowId, '/response-body', { url: String(args.url) })
        const text = base64Encoded
          ? Buffer.from(body as string, 'base64').toString('utf8')
          : (body as string)
        return text.length > 10000 ? text.slice(0, 10000) + '\n... (truncated)' : text
      },
    },
    {
      name: 'browser_save_pdf',
      description:
        'Export the Claude-controlled browser tab as a PDF file and return the saved path. ' +
        'Prints with background colours/images enabled. ' +
        'Optionally supply an absolute path; defaults to a timestamped file in the system temp directory.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path to save to (optional)' },
        },
      },
      handler: async (args) => {
        const params: Record<string, string> = {}
        if (args.path) params.path = String(args.path)
        const { path } = await callJson(socketPath, windowId, '/save-pdf', params)
        return `PDF saved to ${path as string}`
      },
    },
    {
      name: 'browser_get_accessibility_tree',
      description:
        "Read the Claude-controlled browser tab's accessibility tree — a compact semantic outline of the page " +
        'showing roles, names, and values (buttons, links, inputs, headings, etc.). ' +
        'More useful than HTML for understanding page structure and deciding what to interact with, ' +
        'and far more compact than a screenshot for complex UIs. Truncated at 300 nodes.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { tree } = await callJson(socketPath, windowId, '/accessibility-tree')
        return (tree as string) || '(empty tree)'
      },
    },
    {
      name: 'browser_check_certificate',
      description:
        "Inspect the TLS certificate of the Claude-controlled browser tab's current HTTPS page. " +
        'Returns the subject, issuer, validity dates, whether the cert is expired, ' +
        'days until expiry (negative = already expired), and the SHA-256 fingerprint. ' +
        'Only works on HTTPS pages — navigate first, then call this.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const info = await callJson(socketPath, windowId, '/check-certificate')
        const { subject, issuer, validFrom, validTo, isExpired, daysUntilExpiry, fingerprint256 } = info as {
          subject: string; issuer: string; validFrom: string; validTo: string
          isExpired: boolean; daysUntilExpiry: number; fingerprint256: string
        }
        const status = isExpired
          ? `EXPIRED ${Math.abs(daysUntilExpiry)} days ago`
          : `valid for ${daysUntilExpiry} more days`
        return [
          `Status:      ${status}`,
          `Subject:     ${subject}`,
          `Issuer:      ${issuer}`,
          `Valid from:  ${validFrom}`,
          `Valid to:    ${validTo}`,
          `SHA-256:     ${fingerprint256}`,
        ].join('\n')
      },
    },
    {
      name: 'browser_set_extra_headers',
      description:
        'Inject custom HTTP headers into every request made by the Claude-controlled browser tab. ' +
        'Use this to add Authorization tokens, API keys, custom Referer headers, etc. without touching page JS. ' +
        'Headers persist until you call this again with an empty object to clear them. ' +
        'Pass headers as a JSON object, e.g. {"Authorization": "Bearer abc123"}.',
      inputSchema: {
        type: 'object',
        properties: {
          headers: {
            type: 'object',
            description: 'Headers to inject as key/value pairs. Pass {} to clear all previously set headers.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['headers'],
      },
      handler: async (args) => {
        const headers = (args.headers ?? {}) as Record<string, string>
        await callJson(socketPath, windowId, '/set-extra-headers', { headers: JSON.stringify(headers) })
        const count = Object.keys(headers).length
        return count === 0 ? 'Extra headers cleared.' : `${count} header(s) set: ${Object.keys(headers).join(', ')}`
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
