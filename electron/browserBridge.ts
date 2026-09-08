import { BrowserWindow } from 'electron'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { mkdirSync, writeFileSync, chmodSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { BrowserViewManager } from './browserViews'

export const BROWSER_OPEN_EXTERNAL_URL_CHANNEL = 'browser:open-external-url'

// A plain HTTP request over the unix socket, rather than a raw netcat pipe:
// curl closes the connection itself once it gets a response, with no
// close-on-EOF flag to get right across platforms (an earlier `nc`-based
// version hung indefinitely on macOS's builtin nc, which doesn't support the
// `-N`/`-q` flags other nc builds use to close after stdin EOF).
const SHIM_SCRIPT = `#!/bin/sh
# Routes a CLI's browser-open call back into vIDE (see VIDE-7) instead of
# launching the OS's real browser.
curl -s --unix-socket "$VIDE_BROWSER_SHIM_SOCK" -H "X-Vide-Window-Id: $VIDE_WINDOW_ID" --data-urlencode "url=$1" http://vide-browser-shim/open >/dev/null 2>&1
`

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

export function parseShimRequest(windowIdHeader: string | string[] | undefined, body: string): { windowId: number; url: string } | null {
  const windowId = Number(Array.isArray(windowIdHeader) ? windowIdHeader[0] : windowIdHeader)
  if (!Number.isFinite(windowId)) return null
  const url = new URLSearchParams(body).get('url')
  if (!url) return null
  return { windowId, url }
}

// Bridges a CLI subprocess back into vIDE's live main-process state over a
// per-window Unix socket — the only way in, since neither Chromium's
// WebContentsView nor anything else the Browser panel owns exists outside
// this process. Two things ride on it:
//  - Intercepting a CLI subprocess's own `open`/`xdg-open` calls (e.g. a
//    login flow launching an OAuth URL) via shim scripts ahead of the real
//    binaries on PATH, so the URL opens in vIDE's own Browser panel instead
//    of escaping to the OS's default browser (VIDE-7).
//  - Driving a dedicated "Claude" browser tab (navigate/screenshot/click/
//    type/read) for the vide-browser MCP server (VIDE-53), so Claude Code
//    can automate a real page without the separate Claude-in-Chrome
//    extension.
export class BrowserBridge {
  private readonly binDir: string
  readonly socketPath: string
  private server: Server | null = null

  constructor(userDataDir: string, private readonly browserViews: BrowserViewManager) {
    this.binDir = join(userDataDir, 'bin')
    this.socketPath = join(userDataDir, 'browser-shim.sock')
  }

  start(): void {
    this.writeShimScripts()
    this.startServer()
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  getSpawnEnv(windowId: number): Record<string, string> {
    return {
      PATH: `${this.binDir}:${process.env.PATH ?? ''}`,
      // Exposed separately from PATH because a login shell (`-lic`) re-derives
      // PATH from scratch via path_helper before running the actual command,
      // clobbering whatever we set here — callers that spawn via a login
      // shell need this to re-prepend PATH themselves once that's done.
      VIDE_BROWSER_SHIM_BIN: this.binDir,
      VIDE_WINDOW_ID: String(windowId),
      VIDE_BROWSER_SHIM_SOCK: this.socketPath,
    }
  }

  private writeShimScripts(): void {
    mkdirSync(this.binDir, { recursive: true })
    for (const name of ['open', 'xdg-open']) {
      const path = join(this.binDir, name)
      writeFileSync(path, SHIM_SCRIPT)
      chmodSync(path, 0o755)
    }
  }

  private startServer(): void {
    if (existsSync(this.socketPath)) unlinkSync(this.socketPath)
    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res)
      } catch (err) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
    })
    this.server.listen(this.socketPath)
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)

    if (req.url === '/open') {
      const parsed = parseShimRequest(req.headers['x-vide-window-id'], body)
      if (parsed) {
        const win = BrowserWindow.fromId(parsed.windowId)
        if (win && !win.isDestroyed()) win.webContents.send(BROWSER_OPEN_EXTERNAL_URL_CHANNEL, parsed.url)
      }
      res.end()
      return
    }

    // Every browser-control route below targets the single dedicated
    // "Claude" tab (VIDE-53) for the window given by this header — never a
    // tab the user is manually using.
    const windowIdHeader = req.headers['x-vide-window-id']
    const windowId = Number(Array.isArray(windowIdHeader) ? windowIdHeader[0] : windowIdHeader)
    if (!Number.isFinite(windowId)) throw new Error('Missing or invalid X-Vide-Window-Id header')

    if (req.url === '/navigate') {
      const url = new URLSearchParams(body).get('url')
      if (!url) throw new Error('Missing url')
      await this.browserViews.navigateClaudeTab(windowId, url)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/screenshot') {
      const { png, imageSize, viewBounds } = await this.browserViews.captureClaudeTab(windowId)
      res.setHeader('Content-Type', 'image/png')
      // Diagnostic headers (VIDE-53) — see captureClaudeTab's own comment.
      res.setHeader('X-Vide-Image-Size', `${imageSize.width}x${imageSize.height}`)
      res.setHeader('X-Vide-View-Bounds', `${viewBounds.width}x${viewBounds.height}`)
      res.end(png)
      return
    }
    if (req.url === '/click') {
      const params = new URLSearchParams(body)
      const x = Number(params.get('x'))
      const y = Number(params.get('y'))
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Missing or invalid x/y')
      const activeElement = await this.browserViews.clickClaudeTab(windowId, x, y)
      this.endJson(res, { ok: true, activeElement })
      return
    }
    if (req.url === '/type') {
      const text = new URLSearchParams(body).get('text') ?? ''
      await this.browserViews.typeIntoClaudeTab(windowId, text)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/console-logs') {
      this.endJson(res, { logs: this.browserViews.getClaudeTabConsoleLogs(windowId) })
      return
    }
    if (req.url === '/read-text') {
      const text = await this.browserViews.readClaudeTabText(windowId)
      this.endJson(res, { text })
      return
    }
    if (req.url === '/read-html') {
      const html = await this.browserViews.readClaudeTabHtml(windowId)
      this.endJson(res, { html })
      return
    }
    if (req.url === '/evaluate') {
      const script = new URLSearchParams(body).get('script') ?? ''
      if (!script) throw new Error('Missing script')
      const result = await this.browserViews.evaluateInClaudeTab(windowId, script)
      this.endJson(res, { result })
      return
    }
    if (req.url === '/wait-for-load') {
      const timeoutMs = Number(new URLSearchParams(body).get('timeout') ?? '10000')
      await this.browserViews.waitForClaudeTabLoad(windowId, timeoutMs)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/wait-for-selector') {
      const params = new URLSearchParams(body)
      const selector = params.get('selector') ?? ''
      if (!selector) throw new Error('Missing selector')
      const timeoutMs = Number(params.get('timeout') ?? '10000')
      await this.browserViews.waitForSelectorInClaudeTab(windowId, selector, timeoutMs)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/find-element') {
      const params = new URLSearchParams(body)
      const selector = params.get('selector') ?? undefined
      const text = params.get('text') ?? undefined
      const result = await this.browserViews.findElementInClaudeTab(windowId, selector, text)
      this.endJson(res, result)
      return
    }
    if (req.url === '/get-url') {
      const url = this.browserViews.getClaudeTabUrl(windowId)
      this.endJson(res, { url })
      return
    }
    if (req.url === '/scroll') {
      const params = new URLSearchParams(body)
      const selector = params.get('selector') ?? undefined
      const x = Number(params.get('x') ?? '0')
      const y = Number(params.get('y') ?? '0')
      await this.browserViews.scrollClaudeTab(windowId, x, y, selector)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/key-press') {
      const key = new URLSearchParams(body).get('key') ?? ''
      if (!key) throw new Error('Missing key')
      await this.browserViews.keyPressInClaudeTab(windowId, key)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/save-html') {
      const html = await this.browserViews.readClaudeTabHtml(windowId)
      const savePath = new URLSearchParams(body).get('path') ?? join(tmpdir(), `vide-page-${Date.now()}.html`)
      writeFileSync(savePath, html, 'utf-8')
      this.endJson(res, { path: savePath })
      return
    }
    if (req.url === '/response-body') {
      const urlMatch = new URLSearchParams(body).get('url') ?? ''
      if (!urlMatch) throw new Error('Missing url parameter')
      const result = await this.browserViews.getClaudeTabResponseBody(windowId, urlMatch)
      this.endJson(res, result)
      return
    }
    if (req.url === '/save-pdf') {
      const pdf = await this.browserViews.getClaudeTabPdf(windowId)
      const savePath = new URLSearchParams(body).get('path') ?? join(tmpdir(), `vide-page-${Date.now()}.pdf`)
      writeFileSync(savePath, pdf)
      this.endJson(res, { path: savePath })
      return
    }
    if (req.url === '/accessibility-tree') {
      const tree = await this.browserViews.getClaudeTabAccessibilityTree(windowId)
      this.endJson(res, { tree })
      return
    }
    if (req.url === '/check-certificate') {
      const info = await this.browserViews.checkClaudeTabCertificate(windowId)
      this.endJson(res, info)
      return
    }
    if (req.url === '/set-extra-headers') {
      const headers = JSON.parse(new URLSearchParams(body).get('headers') ?? '{}') as Record<string, string>
      await this.browserViews.setClaudeTabExtraHeaders(windowId, headers)
      this.endJson(res, { ok: true })
      return
    }
    if (req.url === '/network-log') {
      const clear = new URLSearchParams(body).get('clear') === '1'
      const log = this.browserViews.getClaudeTabNetworkLog(windowId)
      if (clear) this.browserViews.clearClaudeTabNetworkLog(windowId)
      this.endJson(res, { log })
      return
    }

    res.statusCode = 404
    this.endJson(res, { error: `Unknown route: ${req.url}` })
  }

  private endJson(res: ServerResponse, body: unknown): void {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
}
