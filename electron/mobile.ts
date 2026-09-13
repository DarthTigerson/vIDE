import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { networkInterfaces } from 'os'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join, extname, sep } from 'path'
import QRCode from 'qrcode'
import { UsageManager } from './usageManager'
import { createRelayServer, RelayConnection, RelayServer } from './mobileRelay/relayServer'
import { dispatch } from './mobileRelay/dispatch'
import { registerAllRelayChannels } from './mobileRelay/registerAll'
import { createBroadcaster, Broadcaster } from './mobileRelay/broadcast'
import type { PtyManager } from './pty'
import type { ClaudeManager } from './claude'
import type { BridgeManager } from './bridge'
import type { AutocompleteManager } from './autocomplete'
import type { InlineEditManager } from './inlineEdit'
import type { CommitMessageManager } from './commitMessage'

export interface MobileNetworkInterface {
  name: string
  address: string
}

export interface MobileDevice {
  id: string
  label: string
  connectedAt: number
}

export interface MobileState {
  running: boolean
  port: number
  localIp: string
  pin: string
  qrSvg: string
  connectedCount: number
  allowingNewDevice: boolean
  interfaces: MobileNetworkInterface[]
  devices: MobileDevice[]
}

function getNetworkInterfaceCandidates(): MobileNetworkInterface[] {
  const nets = networkInterfaces()
  const candidates: MobileNetworkInterface[] = []
  for (const [name, ifaces] of Object.entries(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      if (iface.address.startsWith('169.254.')) continue // skip link-local
      candidates.push({ name, address: iface.address })
    }
  }
  return candidates
}

function getLocalIp(candidates: MobileNetworkInterface[]): string {
  const addresses = candidates.map((c) => c.address)
  // prefer 192.168.x.x, then 10.x.x.x, then 172.x.x.x, then whatever's left
  return (
    addresses.find((a) => a.startsWith('192.168.')) ??
    addresses.find((a) => a.startsWith('10.')) ??
    addresses.find((a) => a.startsWith('172.')) ??
    addresses[0] ??
    '127.0.0.1'
  )
}

function labelForUserAgent(userAgent: string | undefined): string {
  const ua = userAgent ?? ''
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  return 'Device'
}

export function generatePin(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, '0')
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => c.trim().split('=').map((s) => s.trim()) as [string, string])
  )
}

// Computed lazily (not at module load) so importing this module — e.g. for
// getMobileBroadcaster() from gitWatcher/fileWatcher — doesn't require
// Electron's `app` to be ready/mocked.
function getMobileWebDir(): string {
  return join(app.getAppPath(), 'electron', 'mobileWeb')
}

// Where `npm run build:mobile` (electron-vite build --mode mobile) writes
// the real vIDE renderer bundle — the same React app that runs in the
// Electron window, built with VITE_MOBILE_CLIENT=true so it boots the
// WebSocket window.api shim (src/lib/mobileApiShim) instead of talking to
// a preload bridge. Computed lazily like getMobileWebDir() above, for the
// same reason (importing this module shouldn't require Electron's `app`).
function getMobileRendererDir(): string {
  return join(app.getAppPath(), 'out', 'renderer')
}

const ASSET_TYPES: Record<string, string> = {
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'usage.js': 'text/javascript; charset=utf-8',
}

// Keyed by extension (not a fixed filename map like ASSET_TYPES above)
// since the renderer build's asset filenames are content-hashed and
// unpredictable ahead of time.
const RENDERER_ASSET_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
}

function readPage(name: string): string {
  return readFileSync(join(getMobileWebDir(), name), 'utf-8')
}

// A floating link back to the mode chooser, injected into the renderer
// bundle's own index.html (never into the app's JS/CSS — those are built
// output we don't touch). The vIDE renderer itself has no concept of the
// mobile chooser, so this is the only way back to it once a defaultMode
// has skipped past the chooser (see handleRequest's /app branch below).
const SWITCH_MODE_LINK =
  '<a href="/app?choose=1" style="position:fixed;top:8px;right:8px;z-index:2147483647;'
  + 'background:#0d0d0dcc;color:#fff;font:11px -apple-system,sans-serif;padding:4px 10px;'
  + 'border-radius:999px;text-decoration:none;backdrop-filter:blur(4px)">Switch mode</a>'

// Serves a file from MOBILE_RENDERER_DIR as a static asset, keyed by
// extension. `injectSwitchModeLink` is only ever set for the bundle's own
// index.html (see the /vide/ route) so phone users can get back to the
// mode chooser.
function serveRendererFile(res: ServerResponse, relPath: string, injectSwitchModeLink = false): void {
  const dir = getMobileRendererDir()
  const filePath = join(dir, decodeURIComponent(relPath))
  if (filePath !== dir && !filePath.startsWith(dir + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  let data: Buffer
  try {
    data = readFileSync(filePath)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }

  const contentType = RENDERER_ASSET_TYPES[extname(filePath)] ?? 'application/octet-stream'
  if (injectSwitchModeLink && contentType.startsWith('text/html')) {
    const html = data.toString('utf-8').replace('<body>', `<body>${SWITCH_MODE_LINK}`)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(html)
    return
  }
  res.writeHead(200, { 'Content-Type': contentType })
  res.end(data)
}

function renderPage(name: string, vars: { theme: string; pinError?: string }): string {
  let out = readPage(name).replace(/%%THEME%%/g, vars.theme)
  if (out.includes('%%PIN_ERROR%%')) {
    const errHtml = vars.pinError
      ? `<p style="color:#f87171;font-size:14px;text-align:center">${vars.pinError}</p>`
      : ''
    out = out.replace('%%PIN_ERROR%%', errHtml)
  }
  return out
}

const USAGE_RANGE_MS: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
}

const BASE_PORT = 7842

// Mobile-relay terminal/Claude sessions aren't tied to any real
// BrowserWindow, so PtyManager/ClaudeManager (which key their per-window
// state by `win.id`) are given this fixed sentinel instead — negative, so
// it can never collide with a real Electron-assigned window id. main.ts
// stamps it onto the fake `broadcastWin` object passed to the relay
// channels; MobileServer.stop() below uses it to dispose that bucket.
export const MOBILE_RELAY_WINDOW_ID = -1

// Set by the one MobileServer instance main.ts constructs, so other
// main-process modules (git/file watchers) can push change events to
// mobile clients without importing MobileServer itself.
let sharedBroadcaster: Broadcaster | null = null

export function getMobileBroadcaster(): Broadcaster {
  if (!sharedBroadcaster) sharedBroadcaster = createBroadcaster()
  return sharedBroadcaster
}

export class MobileServer {
  private win: BrowserWindow
  private server: Server | null = null
  private relay: RelayServer | null = null
  private port = BASE_PORT
  private pin = ''
  private prevPin = ''
  private sessions = new Map<string, { connectedAt: number; label: string }>()
  private interfaces: MobileNetworkInterface[] = []
  private rotateInterval: ReturnType<typeof setInterval> | null = null
  private currentTheme = 'claude-dark'
  private currentFont = 'Menlo, monospace'
  // Mirrors mobileSettingsStore's `defaultMode` (desktop-side setting,
  // pushed down via mobile:setDefaultMode the same way setDisplay's
  // theme/font are). null means "no preference yet" — the chooser at
  // /app always shows both options until the user picks a default.
  private defaultMode: 'graph' | 'vide' | null = null
  private broadcaster = getMobileBroadcaster()
  private state: MobileState = {
    running: false,
    port: BASE_PORT,
    localIp: '127.0.0.1',
    pin: '',
    qrSvg: '',
    connectedCount: 0,
    allowingNewDevice: true,
    interfaces: [],
    devices: [],
  }

  constructor(
    win: BrowserWindow,
    private readonly usageManager: UsageManager,
    private readonly ptyManager: PtyManager,
    private readonly claudeManager: ClaudeManager,
    private readonly bridgeManager: BridgeManager,
    private readonly autocompleteManager: AutocompleteManager,
    private readonly inlineEditManager: InlineEditManager,
    private readonly commitMessageManager: CommitMessageManager
  ) {
    this.win = win
    registerAllRelayChannels({
      ptyManager,
      claudeManager,
      win,
      usageManager,
      bridgeManager,
      autocompleteManager,
      inlineEditManager,
      commitMessageManager,
    })
  }

  private pushState(): void {
    this.win.webContents.send('mobile:state', this.state)
  }

  private rotatePin(): void {
    this.prevPin = this.pin
    this.pin = generatePin()
    this.state.pin = this.pin
    this.pushState()
  }

  private isValidPin(candidate: string): boolean {
    return candidate === this.pin || candidate === this.prevPin
  }

  private isAuthenticated(req: IncomingMessage): boolean {
    const cookies = parseCookies(req.headers.cookie)
    return this.sessions.has(cookies['session'] ?? '')
  }

  private syncDevicesFromSessions(): void {
    this.state.devices = [...this.sessions.entries()].map(([id, info]) => ({
      id,
      label: info.label,
      connectedAt: info.connectedAt,
    }))
    this.state.connectedCount = this.sessions.size
  }

  private openPairingWindow(): void {
    this.prevPin = ''
    this.pin = generatePin()
    this.state.pin = this.pin
    this.state.allowingNewDevice = true
    if (this.rotateInterval) clearInterval(this.rotateInterval)
    this.rotateInterval = setInterval(() => this.rotatePin(), 15_000)
  }

  setDisplay(theme: string, font: string): void {
    this.currentTheme = theme
    this.currentFont = font
  }

  setDefaultMode(mode: 'graph' | 'vide' | null): void {
    this.defaultMode = mode
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`)
    const path = url.pathname

    // Served unauthenticated — the pin-entry page itself needs these before a session exists.
    if (req.method === 'GET' && path.startsWith('/mobile-assets/')) {
      const name = path.slice('/mobile-assets/'.length)
      const contentType = ASSET_TYPES[name]
      if (!contentType) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(readPage(name))
      return
    }

    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderPage('pin.html', { theme: this.currentTheme }))
      return
    }

    if (req.method === 'POST' && path === '/auth') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const params = new URLSearchParams(body)
        const candidate = params.get('pin') ?? ''
        if (this.isValidPin(candidate)) {
          const token = randomUUID()
          this.sessions.set(token, { connectedAt: Date.now(), label: labelForUserAgent(req.headers['user-agent']) })
          // stop rotation — pairing is done until user explicitly requests another device
          if (this.rotateInterval) { clearInterval(this.rotateInterval); this.rotateInterval = null }
          this.syncDevicesFromSessions()
          this.state.allowingNewDevice = false
          this.state.pin = ''
          setImmediate(() => this.pushState())
          res.writeHead(302, {
            'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/`,
            Location: '/app',
          })
          res.end()
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderPage('pin.html', { theme: this.currentTheme, pinError: 'Incorrect PIN — try again' }))
        }
      })
      return
    }

    if (!this.isAuthenticated(req)) {
      res.writeHead(302, { Location: '/' })
      res.end()
      return
    }

    if (req.method === 'GET' && path === '/app') {
      // ?choose=1 is the "switch mode" link's target — it always shows the
      // chooser, bypassing defaultMode, so picking a default is never a
      // dead end.
      const forceChooser = url.searchParams.get('choose') === '1'
      if (!forceChooser && this.defaultMode === 'graph') {
        res.writeHead(302, { Location: '/app/claude-usage' })
        res.end()
        return
      }
      if (!forceChooser && this.defaultMode === 'vide') {
        res.writeHead(302, { Location: '/vide/' })
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderPage('home.html', { theme: this.currentTheme }))
      return
    }

    if (req.method === 'GET' && path === '/vide') {
      res.writeHead(302, { Location: '/vide/' })
      res.end()
      return
    }

    if (req.method === 'GET' && path === '/vide/') {
      serveRendererFile(res, 'index.html', true)
      return
    }

    if (req.method === 'GET' && path.startsWith('/vide/')) {
      serveRendererFile(res, path.slice('/vide/'.length))
      return
    }

    if (req.method === 'GET' && path === '/app/claude-usage') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderPage('usage.html', { theme: this.currentTheme }))
      return
    }

    if (req.method === 'GET' && path === '/api/usage') {
      const range = url.searchParams.get('range') ?? '24h'
      const rangeMs = USAGE_RANGE_MS[range] ?? USAGE_RANGE_MS['24h']
      const snapshots = this.usageManager.poller.getRange(Date.now() - rangeMs, Date.now())
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ snapshots, latest: this.usageManager.poller.getLatest() }))
      return
    }

    if (req.method === 'POST' && path === '/api/usage/interval') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        let ms: number | undefined
        try { ms = JSON.parse(body).ms } catch { /* invalid body — ms stays undefined */ }
        const ok = typeof ms === 'number' && this.usageManager.poller.setIntervalMs(ms)
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok, intervalMs: this.usageManager.poller.getIntervalMs() }))
      })
      return
    }

    if (req.method === 'GET' && path === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        connectedCount: this.sessions.size,
        theme: this.currentTheme,
        font: this.currentFont,
        pollIntervalMs: this.usageManager.poller.getIntervalMs(),
      }))
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }

  private async tryBind(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = createServer()
      s.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') reject(err)
        else reject(err)
      })
      s.once('listening', () => {
        s.close(() => resolve(port))
      })
      s.listen(port, '0.0.0.0')
    })
  }

  async start(): Promise<void> {
    if (this.server) return

    // find an available port
    for (let p = BASE_PORT; p < BASE_PORT + 5; p++) {
      try {
        await this.tryBind(p)
        this.port = p
        break
      } catch {
        if (p === BASE_PORT + 4) throw new Error('No available port found near 7842')
      }
    }

    this.pin = generatePin()
    this.prevPin = ''
    this.interfaces = getNetworkInterfaceCandidates()
    const localIp = getLocalIp(this.interfaces)
    const qrSvg = await this.buildQrForAddress(localIp)

    this.server = createServer((req, res) => this.handleRequest(req, res))
    this.relay = createRelayServer(this.server, {
      isAuthenticated: (cookieHeader) => {
        const cookies = parseCookies(cookieHeader)
        return this.sessions.has(cookies['session'] ?? '')
      },
      onConnection: (conn) => this.handleRelayConnection(conn),
    })
    await new Promise<void>((resolve) => {
      this.server!.listen(this.port, '0.0.0.0', resolve)
    })

    this.rotateInterval = setInterval(() => this.rotatePin(), 15_000)
    this.usageManager.acquire('mobile')

    this.state = {
      running: true,
      port: this.port,
      localIp,
      pin: this.pin,
      qrSvg,
      connectedCount: 0,
      allowingNewDevice: true,
      interfaces: this.interfaces,
      devices: [],
    }
    this.pushState()
  }

  private async buildQrForAddress(address: string): Promise<string> {
    const url = `http://${address}:${this.port}`
    return QRCode.toString(url, { type: 'svg', margin: 1 })
  }

  async selectInterface(address: string): Promise<void> {
    if (!this.server) return
    if (!this.interfaces.some((i) => i.address === address)) return
    this.state.localIp = address
    this.state.qrSvg = await this.buildQrForAddress(address)
    this.pushState()
  }

  private handleRelayConnection(conn: RelayConnection): void {
    this.broadcaster.addConnection(conn)
    conn.onMessage(async (msg) => {
      const response = await dispatch(msg)
      if (response) conn.send(response)
    })
  }

  stop(): void {
    if (this.rotateInterval) { clearInterval(this.rotateInterval); this.rotateInterval = null }
    this.usageManager.release('mobile')
    this.relay?.close()
    this.relay = null
    this.server?.close()
    this.server = null
    this.sessions.clear()
    // Mobile Display turned off entirely — tear down every terminal/Claude
    // session any paired device spawned, same as a real window's 'closed'
    // handler disposing its own PtyManager/ClaudeManager state. A single
    // device disconnecting while others stay paired is intentionally left
    // alone: every device currently shares this one virtual-window bucket
    // (distinguished only by their own instance ids), so disposing here
    // would kill other still-connected devices' sessions too.
    this.ptyManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.claudeManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.bridgeManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.autocompleteManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.inlineEditManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.commitMessageManager.disposeWindow(MOBILE_RELAY_WINDOW_ID)
    this.state = {
      running: false,
      port: this.port,
      localIp: this.state.localIp,
      pin: '',
      qrSvg: '',
      connectedCount: 0,
      allowingNewDevice: true,
      interfaces: this.state.interfaces,
      devices: [],
    }
    this.pushState()
  }

  async addDevice(): Promise<void> {
    if (!this.server) return
    this.openPairingWindow()
    this.pushState()
  }

  disconnectDevice(id: string): void {
    if (!this.sessions.delete(id)) return
    this.syncDevicesFromSessions()
    if (this.sessions.size === 0) this.openPairingWindow()
    this.pushState()
  }

  disconnectAll(): void {
    if (this.sessions.size === 0) return
    this.sessions.clear()
    this.syncDevicesFromSessions()
    this.openPairingWindow()
    this.pushState()
  }

  registerHandlers(): void {
    ipcMain.handle('mobile:start', async () => {
      try { await this.start() } catch (e) { console.error('MobileServer start failed:', e) }
    })
    ipcMain.handle('mobile:stop', () => this.stop())
    ipcMain.handle('mobile:getState', () => this.state)
    ipcMain.handle('mobile:addDevice', () => this.addDevice())
    ipcMain.handle('mobile:selectInterface', (_evt, address: string) => this.selectInterface(address))
    ipcMain.handle('mobile:disconnectDevice', (_evt, id: string) => this.disconnectDevice(id))
    ipcMain.handle('mobile:disconnectAll', () => this.disconnectAll())
    ipcMain.on('mobile:setDisplay', (_evt, theme: string, font: string) => this.setDisplay(theme, font))
    ipcMain.on('mobile:setDefaultMode', (_evt, mode: 'graph' | 'vide' | null) => this.setDefaultMode(mode))
  }

  dispose(): void {
    this.stop()
  }
}
