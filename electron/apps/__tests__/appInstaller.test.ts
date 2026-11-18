import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { createHash } from 'crypto'
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AppInstaller } from '../appInstaller'
import { readInstalled } from '../installedApps'
import type { StoreApp } from '../../storeRegistry'

let appsDir: string
beforeEach(() => { appsDir = mkdtempSync(join(tmpdir(), 'installer-')) })
afterEach(() => rmSync(appsDir, { recursive: true, force: true }))

function manifest(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'hello', name: 'Hello', version: '1.0.0', apiVersion: 1, minVide: '0.4.0',
    renderer: 'renderer.js', contributes: {}, ...over
  })
}

function makeZip(over: Record<string, unknown> = {}): Uint8Array {
  return zipSync({ 'manifest.json': strToU8(manifest(over)), 'renderer.js': strToU8('export {}') })
}

function listing(zip: Uint8Array, over: Partial<StoreApp['latest']> = {}): StoreApp {
  return {
    id: 'hello', name: 'Hello', description: 'd', repo: 'o/r', firstParty: true,
    recommended: false, category: 'applications', targets: ['vide'],
    latest: {
      version: '1.0.0', commit: 'c'.repeat(40), url: 'https://example.com/hello-1.0.0.zip',
      sha256: createHash('sha256').update(zip).digest('hex'), minVide: '0.4.0', ...over
    }
  }
}

function fetchOf(zip: Uint8Array): typeof fetch {
  return vi.fn(async () => new Response(zip as unknown as BodyInit)) as unknown as typeof fetch
}

function installer(zip: Uint8Array, extra: Record<string, unknown> = {}): AppInstaller {
  return new AppInstaller({ appsDir, currentVersion: '0.4.0', fetchFn: fetchOf(zip), ...extra })
}

describe('AppInstaller', () => {
  it('installs a valid package', async () => {
    const zip = makeZip()
    const res = await installer(zip).install(listing(zip))
    expect(res.ok).toBe(true)
    expect(existsSync(join(appsDir, 'hello/1.0.0/manifest.json'))).toBe(true)
    expect(existsSync(join(appsDir, 'hello/1.0.0/renderer.js'))).toBe(true)
    expect(readInstalled(appsDir)).toMatchObject([{ id: 'hello', version: '1.0.0', commit: 'c'.repeat(40) }])
  })

  it('updates: new folder in, record switched, old folder deleted, previous returned', async () => {
    const v1 = makeZip()
    await installer(v1).install(listing(v1))
    const v2 = makeZip({ version: '1.1.0' })
    const res = await installer(v2).install(listing(v2, { version: '1.1.0' }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.previous).toMatchObject({ id: 'hello', version: '1.0.0' })
    expect(existsSync(join(appsDir, 'hello/1.0.0'))).toBe(false)
    expect(existsSync(join(appsDir, 'hello/1.1.0/manifest.json'))).toBe(true)
    expect(readInstalled(appsDir)).toMatchObject([{ id: 'hello', version: '1.1.0' }])
  })

  it('rejects a sha256 mismatch', async () => {
    const zip = makeZip()
    const res = await installer(zip).install(listing(zip, { sha256: '0'.repeat(64) }))
    expect(res).toEqual({ ok: false, error: 'Download did not match the Store checksum.' })
    expect(existsSync(join(appsDir, 'hello'))).toBe(false)
    const tmp = join(appsDir, '.tmp')
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([])
  })

  it('rejects manifest id/version mismatch', async () => {
    const zip = makeZip({ version: '2.0.0' })
    const res = await installer(zip).install(listing(zip))
    expect(res).toEqual({ ok: false, error: 'Package does not match the Store listing.' })
    expect(existsSync(join(appsDir, 'hello'))).toBe(false)
  })

  it('leaves no .tmp leftovers when a failure happens after extraction', async () => {
    const zip = makeZip({ version: '2.0.0' })
    await installer(zip).install(listing(zip))
    const tmp = join(appsDir, '.tmp')
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([])
  })

  it('maps an oversized package to invalid-app', async () => {
    const big = zipSync({ 'manifest.json': strToU8(manifest()), 'renderer.js': strToU8('x'), 'pad.bin': new Uint8Array(300 * 1024 * 1024) })
    const res = await installer(big).install(listing(big))
    expect(res).toEqual({ ok: false, error: 'The downloaded package is not a valid app.' })
    // Zipping/inflating 300 MB takes ~4s alone but 20-35s under full-suite
    // load on an 8 GB machine, past the 5s default.
  }, 120_000)

  it('same-version reinstall leaves a working install and no .old leftovers', async () => {
    const zip = makeZip()
    await installer(zip).install(listing(zip))
    const res = await installer(zip).install(listing(zip))
    expect(res.ok).toBe(true)
    expect(existsSync(join(appsDir, 'hello/1.0.0/manifest.json'))).toBe(true)
    expect(readdirSync(join(appsDir, 'hello'))).toEqual(['1.0.0'])
  })

  it('removes the new folder and keeps the old one when the record cannot be written', async () => {
    const v1 = makeZip()
    await installer(v1).install(listing(v1))
    mkdirSync(join(appsDir, 'installed.json.tmp'))
    const v2 = makeZip({ version: '1.1.0' })
    const res = await installer(v2).install(listing(v2, { version: '1.1.0' }))
    expect(res.ok).toBe(false)
    expect(existsSync(join(appsDir, 'hello/1.1.0'))).toBe(false)
    expect(existsSync(join(appsDir, 'hello/1.0.0/manifest.json'))).toBe(true)
    expect(readInstalled(appsDir)).toMatchObject([{ version: '1.0.0' }])
  })

  it('restores a same-version install when the record cannot be written', async () => {
    const zip = makeZip()
    await installer(zip).install(listing(zip))
    mkdirSync(join(appsDir, 'installed.json.tmp'))
    const res = await installer(zip).install(listing(zip))
    expect(res.ok).toBe(false)
    expect(existsSync(join(appsDir, 'hello/1.0.0/manifest.json'))).toBe(true)
    expect(readdirSync(join(appsDir, 'hello'))).toEqual(['1.0.0'])
  })

  it('rejects apiVersion 2', async () => {
    const zip = makeZip({ apiVersion: 2 })
    const res = await installer(zip).install(listing(zip))
    expect(res).toEqual({ ok: false, error: 'Built for a newer vIDE. Update vIDE first.' })
  })

  it('rejects minVide above currentVersion without fetching', async () => {
    const zip = makeZip()
    const fetchFn = fetchOf(zip)
    const inst = new AppInstaller({ appsDir, currentVersion: '0.3.2', fetchFn })
    const res = await inst.install(listing(zip))
    expect(res).toEqual({ ok: false, error: 'Needs vIDE 0.4.0 or newer.' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects non-first-party', async () => {
    const zip = makeZip()
    const fetchFn = fetchOf(zip)
    const inst = new AppInstaller({ appsDir, currentVersion: '0.4.0', fetchFn })
    const res = await inst.install({ ...listing(zip), firstParty: false } as unknown as StoreApp)
    expect(res).toEqual({ ok: false, error: 'Only apps made by vSuite can be installed.' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('keeps the old version when the new download fails', async () => {
    const v1 = makeZip()
    await installer(v1).install(listing(v1))
    const v2 = makeZip({ version: '1.1.0' })
    const failing = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const res = await new AppInstaller({ appsDir, currentVersion: '0.4.0', fetchFn: failing })
      .install(listing(v2, { version: '1.1.0' }))
    expect(res).toEqual({ ok: false, error: "Couldn't download the app. Check your connection." })
    expect(existsSync(join(appsDir, 'hello/1.0.0/manifest.json'))).toBe(true)
    expect(readInstalled(appsDir)).toMatchObject([{ id: 'hello', version: '1.0.0' }])
  })

  it('rejects a download over maxBytes', async () => {
    const zip = makeZip()
    const res = await installer(zip, { maxBytes: 10 }).install(listing(zip))
    expect(res).toEqual({ ok: false, error: 'The download is larger than an app may be.' })
    expect(existsSync(join(appsDir, 'hello'))).toBe(false)
  })

  it('uninstall removes folder and record', async () => {
    const zip = makeZip()
    const inst = installer(zip)
    await inst.install(listing(zip))
    expect(inst.uninstall('hello')).toEqual({ ok: true })
    expect(existsSync(join(appsDir, 'hello'))).toBe(false)
    expect(readInstalled(appsDir)).toEqual([])
  })

  it('uninstall unknown id', () => {
    expect(installer(makeZip()).uninstall('nope')).toEqual({ ok: false, error: 'Not installed.' })
  })
})
