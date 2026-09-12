import { app, BrowserWindow, ipcMain } from 'electron'
import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { networkInterfaces } from 'os'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import QRCode from 'qrcode'
import { UsageManager } from './usageManager'
import { createRelayServer, RelayConnection, RelayServer } from './mobileRelay/relayServer'
import { dispatch } from './mobileRelay/dispatch'

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

const MOBILE_WEB_DIR = join(app.getAppPath(), 'electron', 'mobileWeb')

const ASSET_TYPES: Record<string, string> = {
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'usage.js': 'text/javascript; charset=utf-8',
}

function readPage(name: string): string {
  return readFileSync(join(MOBILE_WEB_DIR, name), 'utf-8')
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

  constructor(win: BrowserWindow, private readonly usageManager: UsageManager) {
    this.win = win
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
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderPage('home.html', { theme: this.currentTheme }))
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
  }

  dispose(): void {
    this.stop()
  }
}
