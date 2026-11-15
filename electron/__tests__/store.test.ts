import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { StoreService } from '../store'

const SHA = 'a'.repeat(40)
const SUM = 'b'.repeat(64)

function registry(minVide = '0.4.0') {
  return {
    schema: 1,
    apps: [{
      id: 'docker', name: 'Docker', description: 'Containers.', repo: 'o/r', firstParty: true,
      latest: { version: '1.0.0', commit: SHA, url: 'https://x/y.zip', sha256: SUM, minVide },
    }],
  }
}

function response(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response
}

let dir: string
let cacheFile: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vide-store-'))
  cacheFile = join(dir, 'apps', 'registry-cache.json')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function service(fetchFn: ReturnType<typeof vi.fn>, currentVersion = '0.4.0') {
  return new StoreService({ url: 'https://vsuite.tech/registry.json', cacheFile, currentVersion, fetchFn: fetchFn as unknown as typeof fetch })
}

describe('StoreService', () => {
  it('returns ok on a valid 200 and writes the disk cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, JSON.stringify(registry())))
    const state = await service(fetchFn).getRegistry(false)
    expect(state.status).toBe('ok')
    if (state.status !== 'ok') return
    expect(state.fromCache).toBe(false)
    expect(state.apps.map((a) => a.id)).toEqual(['docker'])
    expect(existsSync(cacheFile)).toBe(true)
    expect(JSON.parse(readFileSync(cacheFile, 'utf8')).registry.schema).toBe(1)
  })

  it('passes an abort signal for the timeout', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, JSON.stringify(registry())))
    await service(fetchFn).getRegistry(false)
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('marks apps whose minVide is newer than this vIDE as incompatible', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, JSON.stringify(registry('0.5.0'))))
    const state = await service(fetchFn, '0.4.0').getRegistry(false)
    expect(state.status === 'ok' && state.apps[0].compatible).toBe(false)
    const ok = await service(vi.fn().mockResolvedValue(response(200, JSON.stringify(registry('0.4.0')))), '0.4.0').getRegistry(false)
    expect(ok.status === 'ok' && ok.apps[0].compatible).toBe(true)
  })

  it('treats 404 as an empty store', async () => {
    const state = await service(vi.fn().mockResolvedValue(response(404, 'Not found'))).getRegistry(false)
    expect(state.status).toBe('empty')
  })

  it('treats a valid registry with no apps as empty', async () => {
    const state = await service(vi.fn().mockResolvedValue(response(200, '{"schema":1,"apps":[]}'))).getRegistry(false)
    expect(state.status).toBe('empty')
  })

  it('returns too-new for a newer schema', async () => {
    const state = await service(vi.fn().mockResolvedValue(response(200, '{"schema":2,"apps":[]}'))).getRegistry(false)
    expect(state).toEqual({ status: 'too-new' })
  })

  it('falls back to the disk cache when offline', async () => {
    mkdirSync(join(dir, 'apps'), { recursive: true })
    writeFileSync(cacheFile, JSON.stringify({ checkedAt: 1234, registry: registry() }))
    const state = await service(vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))).getRegistry(false)
    expect(state.status).toBe('ok')
    if (state.status !== 'ok') return
    expect(state.fromCache).toBe(true)
    expect(state.checkedAt).toBe(1234)
  })

  it('returns error when offline with no cache', async () => {
    const state = await service(vi.fn().mockRejectedValue(new Error('offline'))).getRegistry(false)
    expect(state.status).toBe('error')
  })

  it('returns error for an HTML body and leaves the cache alone', async () => {
    mkdirSync(join(dir, 'apps'), { recursive: true })
    const cached = JSON.stringify({ checkedAt: 1, registry: registry() })
    writeFileSync(cacheFile, cached)
    const state = await service(vi.fn().mockResolvedValue(response(200, '<html>Error 522</html>'))).getRegistry(false)
    // A broken response with a cache present still shows the offline copy.
    expect(state.status).toBe('ok')
    expect(state.status === 'ok' && state.fromCache).toBe(true)
    expect(readFileSync(cacheFile, 'utf8')).toBe(cached)
  })

  it('returns error for an HTML body with no cache', async () => {
    const state = await service(vi.fn().mockResolvedValue(response(200, '<html></html>'))).getRegistry(false)
    expect(state.status).toBe('error')
  })

  it('serves the memory result without refetching unless refresh is set', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, JSON.stringify(registry())))
    const svc = service(fetchFn)
    await svc.getRegistry(false)
    await svc.getRegistry(false)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await svc.getRegistry(true)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('shares one fetch between concurrent calls', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200, JSON.stringify(registry())))
    const svc = service(fetchFn)
    await Promise.all([svc.getRegistry(true), svc.getRegistry(true)])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('StoreService periodic refresh', () => {
  it('refetches on the interval and broadcasts store:changed only on change', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      let minVide = '0.4.0'
      const fetchFn = vi.fn().mockImplementation(async () => response(200, JSON.stringify(registry(minVide))))
      const svc = service(fetchFn)
      const onChanged = vi.fn()
      await svc.getRegistry(true)
      fetchFn.mockClear()
      svc.startPeriodicRefresh(1000, onChanged)
      vi.advanceTimersByTime(1000)
      await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
      await svc.getRegistry(false)
      await new Promise((r) => setTimeout(r, 50))
      expect(onChanged).not.toHaveBeenCalled()
      const next = { ...registry(), apps: [{ ...registry().apps[0], latest: { ...registry().apps[0].latest, version: '1.1.0' } }] }
      fetchFn.mockResolvedValue(response(200, JSON.stringify(next)))
      vi.advanceTimersByTime(1000)
      await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
      expect(fetchFn).toHaveBeenCalledTimes(2)
      svc.stopPeriodicRefresh()
      vi.advanceTimersByTime(5000)
      await new Promise((r) => setTimeout(r, 20))
      expect(fetchFn).toHaveBeenCalledTimes(2)
      void minVide
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('StoreService.getReadme', () => {
  function withReadme(readmeUrl: string | undefined) {
    const reg = registry()
    if (readmeUrl) (reg.apps[0] as Record<string, unknown>).readmeUrl = readmeUrl
    return reg
  }
  const text = (body: string, headers: Record<string, string> = {}) =>
    new Response(body, { status: 200, headers })

  it('fetches the README once per app+version and caches it', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('registry.json') ? response(200, JSON.stringify(withReadme('https://vsuite.tech/apps/docker/readme.md'))) : text('# Docker'))
    const svc = new StoreService({ url: 'https://x/registry.json', cacheFile, currentVersion: '0.4.0', fetchFn: fetchFn as unknown as typeof fetch })
    expect(await svc.getReadme('docker')).toEqual({ ok: true, text: '# Docker' })
    expect(await svc.getReadme('docker')).toEqual({ ok: true, text: '# Docker' })
    expect(fetchFn.mock.calls.filter(([u]) => String(u).endsWith('readme.md'))).toHaveLength(1)
  })

  it('is not ok without a readmeUrl, for an unknown app, or when the file is over the cap', async () => {
    const big = 'x'.repeat(513 * 1024)
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('registry.json') ? response(200, JSON.stringify(withReadme('https://vsuite.tech/r.md'))) : text(big))
    const svc = new StoreService({ url: 'https://x/registry.json', cacheFile, currentVersion: '0.4.0', fetchFn: fetchFn as unknown as typeof fetch })
    expect(await svc.getReadme('nope')).toEqual({ ok: false })
    expect(await svc.getReadme('docker')).toEqual({ ok: false })

    const plain = new StoreService({
      url: 'https://x/registry.json', cacheFile: join(dir, 'c2.json'), currentVersion: '0.4.0',
      fetchFn: (async () => response(200, JSON.stringify(withReadme(undefined)))) as unknown as typeof fetch,
    })
    expect(await plain.getReadme('docker')).toEqual({ ok: false })
  })
})
