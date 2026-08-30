import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request } from 'http'
import { mkdtempSync, rmSync, statSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { fromIdMock } = vi.hoisted(() => ({ fromIdMock: vi.fn() }))

vi.mock('electron', () => ({
  BrowserWindow: { fromId: (...args: unknown[]) => fromIdMock(...args) },
}))

import { BrowserOpenShim, parseShimRequest } from '../browserOpenShim'

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

function post(socketPath: string, path: string, windowId: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ url }).toString()
    const req = request(
      {
        socketPath,
        path,
        method: 'POST',
        headers: { 'X-Vide-Window-Id': windowId, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve())
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('BrowserOpenShim', () => {
  let userDataDir: string
  let shim: BrowserOpenShim | undefined

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'vide-browsershim-test-'))
    fromIdMock.mockReset()
  })

  afterEach(() => {
    shim?.stop()
    shim = undefined
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('getSpawnEnv prepends the shim bin dir to PATH and sets the window id + socket path', () => {
    shim = new BrowserOpenShim(userDataDir)
    const env = shim.getSpawnEnv(3)
    expect(env.PATH.split(':')[0]).toBe(join(userDataDir, 'bin'))
    expect(env.VIDE_WINDOW_ID).toBe('3')
    expect(env.VIDE_BROWSER_SHIM_SOCK).toBe(join(userDataDir, 'browser-shim.sock'))
    expect(env.VIDE_BROWSER_SHIM_BIN).toBe(join(userDataDir, 'bin'))
  })

  it('writes open and xdg-open shim scripts as executable files referencing the socket env var', () => {
    shim = new BrowserOpenShim(userDataDir)
    shim.start()
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
    shim = new BrowserOpenShim(userDataDir)
    shim.start()

    await post(join(userDataDir, 'browser-shim.sock'), '/open', '5', 'https://example.com/login')

    expect(fromIdMock).toHaveBeenCalledWith(5)
    expect(win.webContents.send).toHaveBeenCalledWith('browser:open-external-url', 'https://example.com/login')
  })

  it('ignores a request whose window id no longer exists', async () => {
    fromIdMock.mockReturnValue(null)
    shim = new BrowserOpenShim(userDataDir)
    shim.start()

    await post(join(userDataDir, 'browser-shim.sock'), '/open', '99', 'https://example.com')

    expect(fromIdMock).toHaveBeenCalledWith(99)
  })
})
