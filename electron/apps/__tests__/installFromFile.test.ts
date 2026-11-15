import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { createHash } from 'crypto'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { inspectPackage, PackageHolder } from '../installFromFile'
import { AppInstaller } from '../appInstaller'
import { readInstalled } from '../installedApps'
import type { StoreApp } from '../../storeRegistry'

const sha = (zip: Uint8Array) => createHash('sha256').update(zip).digest('hex')

function makeZip(over: Record<string, unknown> = {}, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify({
      id: 'hello', name: 'Hello', version: '1.0.0', apiVersion: 1, minVide: '0.4.0',
      renderer: 'renderer.js', contributes: {}, ...over,
    })),
    'renderer.js': strToU8('export {}'),
    ...extra,
  })
}

function listing(zip: Uint8Array, over: Partial<StoreApp['latest']> = {}): StoreApp {
  return {
    id: 'hello', name: 'Hello', description: 'd', repo: 'o/r', firstParty: true,
    recommended: false, category: 'applications', targets: ['vide'],
    latest: { version: '1.0.0', commit: 'c'.repeat(40), url: 'https://x/hello.zip', sha256: sha(zip), minVide: '0.4.0', ...over },
  }
}

const ctx = (l: StoreApp | null, currentVersion = '0.4.0') => ({ currentVersion, listingFor: async () => l })

describe('inspectPackage', () => {
  it('summarises a valid package and flags a sha that matches the catalog', async () => {
    const zip = makeZip()
    const res = await inspectPackage(zip, ctx(listing(zip)))
    expect(res).toMatchObject({ ok: true, sha256: sha(zip), summary: { id: 'hello', name: 'Hello', version: '1.0.0', matchesStore: true } })
  })

  it('does not match when the catalog has a different sha, or no entry', async () => {
    const zip = makeZip()
    const other = await inspectPackage(zip, ctx(listing(zip, { sha256: 'f'.repeat(64) })))
    expect(other).toMatchObject({ ok: true, summary: { matchesStore: false } })
    const none = await inspectPackage(zip, ctx(null))
    expect(none).toMatchObject({ ok: true, summary: { matchesStore: false } })
  })

  it('includes a small icon as a data URL', async () => {
    const zip = makeZip({ icon: 'assets/icon.png' }, { 'assets/icon.png': new Uint8Array([1, 2, 3]) })
    const res = await inspectPackage(zip, ctx(null))
    expect(res.ok && res.summary.icon).toBe('data:image/png;base64,AQID')
  })

  it('rejects non-zips, missing manifests, bad manifests', async () => {
    expect(await inspectPackage(new Uint8Array([1, 2, 3]), ctx(null))).toMatchObject({ ok: false })
    expect(await inspectPackage(zipSync({ 'a.txt': strToU8('x') }), ctx(null))).toMatchObject({ ok: false })
    expect(await inspectPackage(makeZip({ id: 'Bad Id' }), ctx(null))).toMatchObject({ ok: false })
  })

  it('applies the same version gates as a Store install', async () => {
    expect(await inspectPackage(makeZip({ apiVersion: 2 }), ctx(null))).toEqual({ ok: false, error: 'Built for a newer vIDE. Update vIDE first.' })
    expect(await inspectPackage(makeZip({ minVide: '9.0.0' }), ctx(null))).toEqual({ ok: false, error: 'Needs vIDE 9.0.0 or newer.' })
  })
})

describe('PackageHolder', () => {
  const pkg = { zip: new Uint8Array([1]), id: 'a', name: 'A', version: '1.0.0', matchesStore: false }

  it('gives each token out once', () => {
    const holder = new PackageHolder()
    const token = holder.hold(pkg)
    expect(holder.take(token)).toEqual(pkg)
    expect(holder.take(token)).toBeNull()
    expect(holder.take('nope')).toBeNull()
  })

  it('expires tokens', () => {
    vi.useFakeTimers()
    try {
      const holder = new PackageHolder(1000)
      const token = holder.hold(pkg)
      vi.advanceTimersByTime(1001)
      expect(holder.take(token)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps only the latest inspected package, and discard drops one', () => {
    const holder = new PackageHolder()
    const first = holder.hold(pkg)
    const second = holder.hold(pkg)
    expect(holder.take(first)).toBeNull()
    holder.discard(second)
    expect(holder.take(second)).toBeNull()
  })
})

describe('AppInstaller.installZip', () => {
  let appsDir: string
  beforeEach(() => { appsDir = mkdtempSync(join(tmpdir(), 'file-install-')) })
  afterEach(() => rmSync(appsDir, { recursive: true, force: true }))
  const installer = () => new AppInstaller({ appsDir, currentVersion: '0.4.0' })

  it('a package that is not from the Store installs flagged source "file"', async () => {
    const res = await installer().installZip(makeZip(), {})
    expect(res.ok).toBe(true)
    expect(existsSync(join(appsDir, 'hello/1.0.0/renderer.js'))).toBe(true)
    expect(readInstalled(appsDir)).toMatchObject([{ id: 'hello', version: '1.0.0', commit: '', source: 'file' }])
  })

  it('a package matching the catalog installs like a Store install (no file flag, catalog commit)', async () => {
    const zip = makeZip()
    const res = await installer().installZip(zip, { listing: listing(zip) })
    expect(res.ok).toBe(true)
    const [rec] = readInstalled(appsDir)
    expect(rec.commit).toBe('c'.repeat(40))
    expect(rec).not.toHaveProperty('source')
  })

  it('a later Store install replaces a file install normally', async () => {
    await installer().installZip(makeZip(), {})
    const v2 = makeZip({ version: '1.1.0' })
    const res = await installer().installZip(v2, { listing: listing(v2, { version: '1.1.0' }) })
    expect(res.ok).toBe(true)
    expect(readInstalled(appsDir)).toHaveLength(1)
    expect(readInstalled(appsDir)[0]).toMatchObject({ version: '1.1.0' })
    expect(readInstalled(appsDir)[0]).not.toHaveProperty('source')
    expect(existsSync(join(appsDir, 'hello/1.0.0'))).toBe(false)
  })

  it('still refuses a listing/package mismatch, newer apiVersion and newer minVide', async () => {
    const zip = makeZip()
    expect(await installer().installZip(zip, { listing: listing(zip, { version: '2.0.0' }) })).toEqual({ ok: false, error: 'Package does not match the Store listing.' })
    expect(await installer().installZip(makeZip({ apiVersion: 2 }), {})).toMatchObject({ ok: false })
    expect(await installer().installZip(makeZip({ minVide: '9.0.0' }), {})).toEqual({ ok: false, error: 'Needs vIDE 9.0.0 or newer.' })
    expect(readInstalled(appsDir)).toEqual([])
  })
})
