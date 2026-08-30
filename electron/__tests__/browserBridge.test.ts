import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request } from 'http'
import { mkdtempSync, rmSync, statSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { fromIdMock } = vi.hoisted(() => ({ fromIdMock: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: { fromId: (...args: unknown[]) => fromIdMock(...args) },
}))

import { BrowserBridge, parseShimRequest } from '../browserBridge'

describe('parseShimRequest', () => {
  it('parses a window-id header and url-encoded body', () => {
    expect(parseShimRequest('7', 'url=https%3A%2F%2Fexample.com%2Flogin')).toEqual({
      windowId: 7,
      url: 'https://example.com/login',
    })
  })

  it('returns null when the window-id header is missing or non-numeric', () => {
    expect(parseShimRequest(undefined, 'url=https://example.com')).toBeNull()
    expect(parseShimRequest('not-a-number', 'url=https://example.com')).toBeNull()
  })

  it('returns null when the body has no url field', () => {
    expect(parseShimRequest('7', '')).toBeNull()
  })
})

interface JsonResponse {
  status: number
  body: string
  headers: Record<string, string | string[] | undefined>
}

function post(socketPath: string, path: string, headers: Record<string, string>, body: string): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }))
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

function postOpen(socketPath: string, windowId: string, url: string): Promise<JsonResponse> {
  return post(socketPath, '/open', { 'X-Vide-Window-Id': windowId }, new URLSearchParams({ url }).toString())
}

function fakeBrowserViews() {
  return {
    navigateClaudeTab: vi.fn(async () => {}),
    captureClaudeTab: vi.fn(async () => ({
      png: Buffer.from('fake-png'),
      imageSize: { width: 650, height: 400 },
      viewBounds: { width: 650, height: 400 },
    })),
    clickClaudeTab: vi.fn(async () => 'INPUT#test-input'),
    typeIntoClaudeTab: vi.fn(async () => {}),
    getClaudeTabConsoleLogs: vi.fn(() => ['[info] hello']),
    readClaudeTabText: vi.fn(async () => 'page text'),
  }
}

describe('BrowserBridge — open-url shim (VIDE-7)', () => {
  let userDataDir: string
  let bridge: BrowserBridge | undefined
  let browserViews: ReturnType<typeof fakeBrowserViews>

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'vide-browserbridge-test-'))
    fromIdMock.mockReset()
    browserViews = fakeBrowserViews()
  })

  afterEach(() => {
    bridge?.stop()
    bridge = undefined
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('getSpawnEnv prepends the shim bin dir to PATH and sets the window id + socket path', () => {
    bridge = new BrowserBridge(userDataDir, browserViews as any)
    const env = bridge.getSpawnEnv(3)
    expect(env.PATH.split(':')[0]).toBe(join(userDataDir, 'bin'))
    expect(env.VIDE_WINDOW_ID).toBe('3')
    expect(env.VIDE_BROWSER_SHIM_SOCK).toBe(join(userDataDir, 'browser-shim.sock'))
    expect(env.VIDE_BROWSER_SHIM_BIN).toBe(join(userDataDir, 'bin'))
  })

  it('writes open and xdg-open shim scripts as executable files referencing the socket env var', () => {
    bridge = new BrowserBridge(userDataDir, browserViews as any)
    bridge.start()
    for (const name of ['open', 'xdg-open']) {
      const path = join(userDataDir, 'bin', name)
      const mode = statSync(path).mode
      expect(mode & 0o111).not.toBe(0)
      expect(readFileSync(path, 'utf8')).toContain('VIDE_BROWSER_SHIM_SOCK')
    }
  })

  it('routes an incoming shim request to the right window via IPC', async () => {
    const win = { webContents: { send: vi.fn() }, isDestroyed: () => false }
    fromIdMock.mockReturnValue(win)
    bridge = new BrowserBridge(userDataDir, browserViews as any)
    bridge.start()

    await postOpen(join(userDataDir, 'browser-shim.sock'), '5', 'https://example.com/login')

    expect(fromIdMock).toHaveBeenCalledWith(5)
    expect(win.webContents.send).toHaveBeenCalledWith('browser:open-external-url', 'https://example.com/login')
  })

  it('ignores a request whose window id no longer exists', async () => {
    fromIdMock.mockReturnValue(null)
    bridge = new BrowserBridge(userDataDir, browserViews as any)
    bridge.start()

    await postOpen(join(userDataDir, 'browser-shim.sock'), '99', 'https://example.com')

    expect(fromIdMock).toHaveBeenCalledWith(99)
  })
})

describe('BrowserBridge — Claude tab control routes (VIDE-53)', () => {
  let userDataDir: string
  let bridge: BrowserBridge
  let browserViews: ReturnType<typeof fakeBrowserViews>
  let socketPath: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'vide-browserbridge-test-'))
    fromIdMock.mockReset()
    browserViews = fakeBrowserViews()
    bridge = new BrowserBridge(userDataDir, browserViews as any)
    bridge.start()
    socketPath = join(userDataDir, 'browser-shim.sock')
  })

  afterEach(() => {
    bridge.stop()
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('/navigate forwards the url to navigateClaudeTab for the requesting window', async () => {
    const res = await post(socketPath, '/navigate', { 'X-Vide-Window-Id': '7' }, new URLSearchParams({ url: 'https://example.com' }).toString())

    expect(browserViews.navigateClaudeTab).toHaveBeenCalledWith(7, 'https://example.com')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('/navigate 400s when the url is missing', async () => {
    const res = await post(socketPath, '/navigate', { 'X-Vide-Window-Id': '7' }, '')
    expect(res.status).toBe(400)
    expect(browserViews.navigateClaudeTab).not.toHaveBeenCalled()
  })

  it('/screenshot returns the captured PNG bytes, with image-size/view-bounds diagnostic headers', async () => {
    const res = await post(socketPath, '/screenshot', { 'X-Vide-Window-Id': '7' }, '')
    expect(browserViews.captureClaudeTab).toHaveBeenCalledWith(7)
    expect(res.body).toBe('fake-png')
    expect(res.headers['x-vide-image-size']).toBe('650x400')
    expect(res.headers['x-vide-view-bounds']).toBe('650x400')
  })

  it('/click forwards x and y as numbers and returns the focused element afterward', async () => {
    const res = await post(socketPath, '/click', { 'X-Vide-Window-Id': '7' }, new URLSearchParams({ x: '12', y: '34' }).toString())
    expect(browserViews.clickClaudeTab).toHaveBeenCalledWith(7, 12, 34)
    expect(JSON.parse(res.body)).toEqual({ ok: true, activeElement: 'INPUT#test-input' })
  })

  it('/click 400s when x/y are missing or invalid', async () => {
    const res = await post(socketPath, '/click', { 'X-Vide-Window-Id': '7' }, new URLSearchParams({ x: 'nope' }).toString())
    expect(res.status).toBe(400)
    expect(browserViews.clickClaudeTab).not.toHaveBeenCalled()
  })

  it('/type forwards the text', async () => {
    await post(socketPath, '/type', { 'X-Vide-Window-Id': '7' }, new URLSearchParams({ text: 'hello world' }).toString())
    expect(browserViews.typeIntoClaudeTab).toHaveBeenCalledWith(7, 'hello world')
  })

  it('/console-logs returns the buffered logs as JSON', async () => {
    const res = await post(socketPath, '/console-logs', { 'X-Vide-Window-Id': '7' }, '')
    expect(browserViews.getClaudeTabConsoleLogs).toHaveBeenCalledWith(7)
    expect(JSON.parse(res.body)).toEqual({ logs: ['[info] hello'] })
  })

  it('/read-text returns the page text as JSON', async () => {
    const res = await post(socketPath, '/read-text', { 'X-Vide-Window-Id': '7' }, '')
    expect(browserViews.readClaudeTabText).toHaveBeenCalledWith(7)
    expect(JSON.parse(res.body)).toEqual({ text: 'page text' })
  })

  it('400s a control route with a missing or non-numeric window id header', async () => {
    const res = await post(socketPath, '/screenshot', {}, '')
    expect(res.status).toBe(400)
    expect(browserViews.captureClaudeTab).not.toHaveBeenCalled()
  })

  it('404s an unknown route', async () => {
    const res = await post(socketPath, '/not-a-real-route', { 'X-Vide-Window-Id': '7' }, '')
    expect(res.status).toBe(404)
  })

  it('surfaces a rejected browserViews call as a 400 with the error message', async () => {
    browserViews.navigateClaudeTab.mockRejectedValueOnce(new Error('vIDE window 7 not found'))
    const res = await post(socketPath, '/navigate', { 'X-Vide-Window-Id': '7' }, new URLSearchParams({ url: 'https://example.com' }).toString())
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'vIDE window 7 not found' })
  })
})
