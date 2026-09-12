import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { get, request } from 'http'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, cpSync } from 'fs'
import { tmpdir } from 'os'

const { ipcOnHandlers, userDataDir, appPathRef } = vi.hoisted(() => {
  const { mkdtempSync } = require('fs')
  const { tmpdir } = require('os')
  const { join } = require('path')
  return {
    ipcOnHandlers: {} as Record<string, (...args: any[]) => unknown>,
    userDataDir: mkdtempSync(join(tmpdir(), 'vide-mobile-test-')) as string,
    // Mutable so a describe block can point app.getAppPath() at an isolated
    // temp directory for the duration of its own tests (see the 'MobileServer
    // vIDE mode' block below, which needs a fake out/renderer it can freely
    // write to and delete — never the real project's build output at
    // <repo>/out/renderer, which process.cwd() would otherwise resolve to).
    appPathRef: { current: process.cwd() },
  }
})

vi.mock('electron', () => ({
  app: { getAppPath: () => appPathRef.current, getPath: () => userDataDir },
  ipcMain: {
    handle: () => {},
    on: (channel: string, fn: (...args: any[]) => unknown) => { ipcOnHandlers[channel] = fn },
  },
}))

// Ensure at least two non-internal IPv4 candidates regardless of the host's real network config,
// so interface-selection tests are deterministic in CI/sandboxes with only one live interface.
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    networkInterfaces: () => ({
      en0: [{ address: '192.168.1.50', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00', cidr: '192.168.1.50/24' }],
      en5: [{ address: '10.0.0.20', netmask: '255.255.255.0', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00', cidr: '10.0.0.20/24' }],
    }),
  }
})

import { MobileServer, MOBILE_RELAY_WINDOW_ID } from '../mobile'
import { UsageManager } from '../usageManager'
import { join } from 'path'

function fakeWin() {
  return { webContents: { send: vi.fn() } } as any
}

function fakePtyManager() {
  return { spawn: vi.fn(), kill: vi.fn(), write: vi.fn(), resize: vi.fn(), disposeWindow: vi.fn() } as any
}

function fakeClaudeManager() {
  return { spawn: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(), disposeWindow: vi.fn() } as any
}

function newServer(): MobileServer {
  const usageManager = new UsageManager(
    join(userDataDir, 'usage-history.jsonl'),
    join(userDataDir, 'usage-settings.json'),
    join(userDataDir, 'usage-passive-settings.json'),
    fakeWin()
  )
  return new MobileServer(fakeWin(), usageManager, fakePtyManager(), fakeClaudeManager())
}

function newServerWithManagers(): { server: MobileServer; ptyManager: ReturnType<typeof fakePtyManager>; claudeManager: ReturnType<typeof fakeClaudeManager> } {
  const usageManager = new UsageManager(
    join(userDataDir, 'usage-history.jsonl'),
    join(userDataDir, 'usage-settings.json'),
    join(userDataDir, 'usage-passive-settings.json'),
    fakeWin()
  )
  const ptyManager = fakePtyManager()
  const claudeManager = fakeClaudeManager()
  const server = new MobileServer(fakeWin(), usageManager, ptyManager, claudeManager)
  return { server, ptyManager, claudeManager }
}

function authenticate(port: number, pin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = `pin=${pin}`
    const req = request(
      { host: '127.0.0.1', port, path: '/auth', method: 'POST', agent: false, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        res.resume()
        const cookie = res.headers['set-cookie']?.[0]?.split(';')[0]
        if (!cookie) return reject(new Error('no session cookie'))
        resolve(cookie)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function fetchJson(port: number, path: string, cookie: string): Promise<any> {
  return fetchText(port, path, cookie).then((body) => JSON.parse(body))
}

function fetchText(port: number, path: string, cookie?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, agent: false, headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

function fetchFull(port: number, path: string, cookie?: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, agent: false, headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body }))
    }).on('error', reject)
  })
}

function postJson(port: number, path: string, cookie: string, payload: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const req = request(
      { host: '127.0.0.1', port, path, method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Cookie: cookie } },
      (res) => {
        let raw = ''
        res.on('data', (c) => { raw += c })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }))
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function authenticateWithUserAgent(port: number, pin: string, userAgent: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = `pin=${pin}`
    const req = request(
      {
        host: '127.0.0.1', port, path: '/auth', method: 'POST', agent: false,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': userAgent,
        },
      },
      (res) => {
        res.resume()
        const cookie = res.headers['set-cookie']?.[0]?.split(';')[0]
        if (!cookie) return reject(new Error('no session cookie'))
        resolve(cookie)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('MobileServer display sync', () => {
  let server: MobileServer

  afterEach(() => {
    server?.stop()
  })

  async function startAndAuth(): Promise<string> {
    server = newServer()
    await server.start()
    return authenticate(server['port'], server['pin'])
  }

  it('defaults /api/state theme and font', async () => {
    const cookie = await startAndAuth()
    const state = await fetchJson(server['port'], '/api/state', cookie)
    expect(state.theme).toBe('claude-dark')
    expect(state.font).toBe('Menlo, monospace')
  })

  it('reflects setDisplay in /api/state', async () => {
    const cookie = await startAndAuth()
    server.setDisplay('thomas-light', 'Consolas, monospace')
    const state = await fetchJson(server['port'], '/api/state', cookie)
    expect(state.theme).toBe('thomas-light')
    expect(state.font).toBe('Consolas, monospace')
  })

  it('wires mobile:setDisplay through ipcMain.on', async () => {
    server = newServer()
    server.registerHandlers()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])
    ipcOnHandlers['mobile:setDisplay'](null, 'link-dark', 'Monaco, monospace')
    const state = await fetchJson(server['port'], '/api/state', cookie)
    expect(state.theme).toBe('link-dark')
    expect(state.font).toBe('Monaco, monospace')
  })

  it('renders pages with the theme substituted and no leftover placeholders', async () => {
    server = newServer()
    await server.start()
    server.setDisplay('thomas-dark', 'Menlo, monospace')

    const pin = await fetchText(server['port'], '/')
    expect(pin).toContain('data-theme="thomas-dark"')
    expect(pin).not.toContain('%%')

    const cookie = await authenticate(server['port'], server['pin'])
    const home = await fetchText(server['port'], '/app', cookie)
    expect(home).toContain('data-theme="thomas-dark"')
    expect(home).not.toContain('%%')

    const usage = await fetchText(server['port'], '/app/claude-usage', cookie)
    expect(usage).toContain('data-theme="thomas-dark"')
    expect(usage).not.toContain('%%')
  })

  it('serves mobile-assets with correct content types', async () => {
    server = newServer()
    await server.start()
    const css = await fetchText(server['port'], '/mobile-assets/style.css')
    expect(css).toContain('[data-theme="claude-dark"]')
    const js = await fetchText(server['port'], '/mobile-assets/app.js')
    expect(js).toContain('applyDisplay')
  })

  it('/api/usage defaults to no data before any poll has run', async () => {
    const cookie = await startAndAuth()
    const usage = await fetchJson(server['port'], '/api/usage', cookie)
    expect(usage.latest).toBeNull()
    expect(usage.snapshots).toEqual([])
  })

  it('/api/state reports the default poll interval', async () => {
    const cookie = await startAndAuth()
    const state = await fetchJson(server['port'], '/api/state', cookie)
    expect(state.pollIntervalMs).toBe(60_000)
  })

  it('POST /api/usage/interval updates the interval, reflected in /api/state', async () => {
    const cookie = await startAndAuth()
    const res = await postJson(server['port'], '/api/usage/interval', cookie, { ms: 300_000 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, intervalMs: 300_000 })

    const state = await fetchJson(server['port'], '/api/state', cookie)
    expect(state.pollIntervalMs).toBe(300_000)
  })

  it('POST /api/usage/interval rejects a value outside the presets', async () => {
    const cookie = await startAndAuth()
    const res = await postJson(server['port'], '/api/usage/interval', cookie, { ms: 12_345 })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })
})

describe('MobileServer network interfaces', () => {
  let server: MobileServer

  afterEach(() => {
    server?.stop()
  })

  it('populates state.interfaces with at least one candidate and defaults localIp to one of them', async () => {
    server = newServer()
    await server.start()
    expect(server['state'].interfaces.length).toBeGreaterThan(0)
    expect(server['state'].interfaces.map((i: { address: string }) => i.address)).toContain(server['state'].localIp)
  })

  it('selectInterface updates localIp and regenerates the QR code', async () => {
    server = newServer()
    await server.start()
    const interfaces = server['state'].interfaces as { name: string; address: string }[]
    const other = interfaces.find((i) => i.address !== server['state'].localIp) ?? interfaces[0]
    const prevQr = server['state'].qrSvg

    await server.selectInterface(other.address)

    expect(server['state'].localIp).toBe(other.address)
    expect(server['state'].qrSvg).not.toBe(prevQr)
  })

  it('selectInterface ignores an address that is not in the detected list', async () => {
    server = newServer()
    await server.start()
    const before = server['state'].localIp
    await server.selectInterface('203.0.113.1')
    expect(server['state'].localIp).toBe(before)
  })
})

describe('MobileServer device tracking', () => {
  let server: MobileServer

  afterEach(() => {
    server?.stop()
  })

  it('records a connecting device with a coarse label parsed from User-Agent', async () => {
    server = newServer()
    await server.start()
    await authenticateWithUserAgent(server['port'], server['pin'], 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit')

    expect(server['state'].devices).toHaveLength(1)
    expect(server['state'].devices[0].label).toBe('iPhone')
    expect(typeof server['state'].devices[0].connectedAt).toBe('number')
    expect(typeof server['state'].devices[0].id).toBe('string')
  })

  it('disconnectDevice removes just that device and reopens pairing once none remain', async () => {
    server = newServer()
    await server.start()
    const cookie1 = await authenticateWithUserAgent(server['port'], server['pin'], 'iPhone')
    await server.addDevice()
    const cookie2 = await authenticateWithUserAgent(server['port'], server['pin'], 'iPad')
    expect(server['state'].devices).toHaveLength(2)

    const [first, second] = server['state'].devices as { id: string }[]
    server.disconnectDevice(first.id)
    expect(server['state'].devices).toHaveLength(1)
    expect(server['state'].allowingNewDevice).toBe(false)

    // the surviving session should still work
    const state1 = await fetchJson(server['port'], '/api/state', cookie2)
    expect(state1.connectedCount).toBe(1)
    void cookie1

    server.disconnectDevice(second.id)
    expect(server['state'].devices).toHaveLength(0)
    expect(server['state'].allowingNewDevice).toBe(true)
    expect(server['state'].pin).not.toBe('')
  })

  it('disconnectAll clears every session and reopens pairing', async () => {
    server = newServer()
    await server.start()
    await authenticateWithUserAgent(server['port'], server['pin'], 'iPhone')
    await server.addDevice()
    await authenticateWithUserAgent(server['port'], server['pin'], 'iPad')
    expect(server['state'].devices).toHaveLength(2)

    server.disconnectAll()

    expect(server['state'].devices).toHaveLength(0)
    expect(server['state'].connectedCount).toBe(0)
    expect(server['state'].allowingNewDevice).toBe(true)
    expect(server['state'].pin).not.toBe('')
  })
})

describe('MobileServer relay session teardown', () => {
  let server: MobileServer

  afterEach(() => {
    server?.stop()
  })

  it('stop() disposes the mobile relay virtual-window bucket in both PtyManager and ClaudeManager', async () => {
    const created = newServerWithManagers()
    server = created.server
    await server.start()

    server.stop()

    expect(created.ptyManager.disposeWindow).toHaveBeenCalledWith(MOBILE_RELAY_WINDOW_ID)
    expect(created.claudeManager.disposeWindow).toHaveBeenCalledWith(MOBILE_RELAY_WINDOW_ID)
  })
})

// MOBILE_RENDERER_DIR resolves to `<app.getAppPath()>/out/renderer`. Under
// this file's *default* electron mock that's `<cwd>/out/renderer` — the
// real `npm run build:mobile` output directory, which must never be
// written to or deleted by a test (it's a real developer/CI build
// artifact, not something this suite owns). So this block instead points
// `appPathRef.current` (see the top of this file) at its own throwaway
// temp directory for the duration of its tests, with a copy of the real
// electron/mobileWeb templates (needed by readPage()/renderPage() for the
// /app chooser) plus a minimal fixture renderer bundle underneath a fake
// out/renderer — fully disjoint from the project's real out/renderer, so a
// real prior build survives this suite untouched regardless of what's on
// disk when it runs.
describe('MobileServer vIDE mode', () => {
  let server: MobileServer
  let fakeAppRoot: string
  let rendererDir: string

  beforeAll(() => {
    fakeAppRoot = mkdtempSync(join(tmpdir(), 'vide-mobile-vide-test-app-'))
    cpSync(join(process.cwd(), 'electron', 'mobileWeb'), join(fakeAppRoot, 'electron', 'mobileWeb'), { recursive: true })
    rendererDir = join(fakeAppRoot, 'out', 'renderer')
    mkdirSync(join(rendererDir, 'assets'), { recursive: true })
    writeFileSync(
      join(rendererDir, 'index.html'),
      '<!DOCTYPE html><html><head><title>vIDE</title></head><body><div id="root"></div>'
      + '<script type="module" src="./assets/index-test.js"></script>'
      + '<link rel="stylesheet" href="./assets/index-test.css"></body></html>'
    )
    writeFileSync(join(rendererDir, 'assets', 'index-test.js'), 'console.log("fixture")')
    writeFileSync(join(rendererDir, 'assets', 'index-test.css'), 'body{margin:0}')
    appPathRef.current = fakeAppRoot
  })

  afterAll(() => {
    appPathRef.current = process.cwd()
    rmSync(fakeAppRoot, { recursive: true, force: true })
  })

  afterEach(() => {
    server?.stop()
  })

  it('serves a mode chooser after successful pairing, listing both Graph Display and vIDE', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])

    const res = await fetchFull(server['port'], '/app', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toContain('Graph Display')
    expect(res.body).toContain('vIDE')
    expect(res.body).toContain('/app/claude-usage')
    expect(res.body).toContain('/vide/')
  })

  it('serves the built renderer bundle when vIDE mode is selected', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])

    const res = await fetchFull(server['port'], '/vide/', cookie)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('<div id="root">')
  })

  it('redirects /vide (no trailing slash) to /vide/', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])

    const res = await fetchFull(server['port'], '/vide', cookie)
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/vide/')
  })

  it('serves renderer static assets with content types keyed by extension', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])

    const js = await fetchFull(server['port'], '/vide/assets/index-test.js', cookie)
    expect(js.status).toBe(200)
    expect(js.headers['content-type']).toContain('javascript')
    expect(js.body).toContain('fixture')

    const css = await fetchFull(server['port'], '/vide/assets/index-test.css', cookie)
    expect(css.status).toBe(200)
    expect(css.headers['content-type']).toContain('text/css')
  })

  it('404s a renderer asset that does not exist', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])

    const res = await fetchFull(server['port'], '/vide/assets/does-not-exist.js', cookie)
    expect(res.status).toBe(404)
  })

  it('gates /vide/* behind the same auth check as every other authenticated route', async () => {
    server = newServer()
    await server.start()

    const res = await fetchFull(server['port'], '/vide/')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
  })

  it('redirects /app straight to the preferred mode once a default is set, and /app?choose=1 still shows the chooser', async () => {
    server = newServer()
    await server.start()
    const cookie = await authenticate(server['port'], server['pin'])
    server.setDefaultMode('vide')

    const redirected = await fetchFull(server['port'], '/app', cookie)
    expect(redirected.status).toBe(302)
    expect(redirected.headers.location).toBe('/vide/')

    const chooser = await fetchFull(server['port'], '/app?choose=1', cookie)
    expect(chooser.status).toBe(200)
    expect(chooser.body).toContain('Graph Display')
    expect(chooser.body).toContain('vIDE')
  })
})
