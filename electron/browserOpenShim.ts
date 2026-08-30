import { BrowserWindow } from 'electron'
import { createServer, IncomingMessage, Server } from 'http'
import { mkdirSync, writeFileSync, chmodSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

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

// Intercepts a CLI subprocess's own `open`/`xdg-open` calls (e.g. a login
// flow launching an OAuth URL) by putting shim scripts ahead of the real
// binaries on PATH, so the URL opens in vIDE's own Browser panel instead of
// escaping to the OS's default browser.
export class BrowserOpenShim {
  private readonly binDir: string
  readonly socketPath: string
  private server: Server | null = null

  constructor(userDataDir: string) {
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
      const body = await readBody(req)
      const parsed = parseShimRequest(req.headers['x-vide-window-id'], body)
      if (parsed) {
        const win = BrowserWindow.fromId(parsed.windowId)
        if (win && !win.isDestroyed()) win.webContents.send(BROWSER_OPEN_EXTERNAL_URL_CHANNEL, parsed.url)
      }
      res.end()
    })
    this.server.listen(this.socketPath)
  }
}
