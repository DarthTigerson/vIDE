import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { createRequire } from 'module'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: {}, dialog: {}, app: {} }))

import { AppHost } from '../appHost'
import { writeInstalled } from '../installedApps'
import type { AppInstaller } from '../appInstaller'

const nodeRequire = createRequire(import.meta.url)
const FIXTURE = join(__dirname, '..', '__fixtures__', 'hello-app')
const requireFresh = (p: string) => {
  delete nodeRequire.cache[nodeRequire.resolve(p)]
  return nodeRequire(p)
}

let dir: string
let broadcast: Mock<(...args: any[]) => any>
let sendTo: Mock<(...args: any[]) => any>
let installer: { install: Mock<(...args: any[]) => any>; uninstall: Mock<(...args: any[]) => any>; installDir: (id: string, v: string) => string }
let getListing: Mock<(...args: any[]) => any>

function installFixture(id = 'hello', version = '1.0.0', mainSrc?: string) {
  const target = join(dir, id, version)
  cpSync(FIXTURE, target, { recursive: true })
  const m = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'))
  m.id = id; m.version = version
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(m))
  if (mainSrc) writeFileSync(join(target, 'main.js'), mainSrc)
  return target
}
function record(id: string, version = '1.0.0') {
  return { id, version, commit: 'a'.repeat(40), installedAt: 1 }
}
function make(isDev = false) {
  return new AppHost({
    appsDir: dir,
    installer: installer as unknown as AppInstaller,
    getListing,
    isDev,
    currentVersion: '0.4.0',
    broadcast: broadcast as never,
    sendTo: sendTo as never,
    requireFn: requireFresh
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apphost-'))
  broadcast = vi.fn()
  sendTo = vi.fn()
  getListing = vi.fn()
  installer = {
    install: vi.fn(),
    uninstall: vi.fn(() => ({ ok: true })),
    installDir: (id, v) => join(dir, id, v)
  }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('AppHost', () => {
  it('start loads installed apps without a catalog', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    expect(getListing).not.toHaveBeenCalled()
    expect(host.list()[0]).toMatchObject({
      id: 'hello', status: 'loaded', hasMain: true, source: 'store',
      rendererUrl: 'vide-app://hello/renderer.js?v=1.0.0'
    })
  })

  it('start sweeps .tmp and old-* leftovers', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    mkdirSync(join(dir, '.tmp', 'x'), { recursive: true })
    mkdirSync(join(dir, 'hello', '1.0.0.old-abc'), { recursive: true })
    await make().start()
    expect(existsSync(join(dir, '.tmp', 'x'))).toBe(false)
    expect(existsSync(join(dir, 'hello', '1.0.0.old-abc'))).toBe(false)
    expect(existsSync(join(dir, 'hello', '1.0.0'))).toBe(true)
  })

  it('call routes to main.js handler with windowId', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    await expect(host.call('hello', 'ping', 1, 5)).resolves.toEqual({ pong: 1 })
    await expect(host.call('hello', 'nope', null, 5)).rejects.toThrow(/No handler/)
  })

  it('a main.js that throws in activate is failed, others still load', async () => {
    installFixture('bad', '1.0.0', "exports.activate = function () { throw new Error('boom') }")
    installFixture('hello')
    writeInstalled(dir, [record('bad'), record('hello')])
    const host = make()
    await host.start()
    const list = host.list()
    expect(list.find((a) => a.id === 'bad')).toMatchObject({ status: 'failed', error: 'boom' })
    expect(list.find((a) => a.id === 'hello')?.status).toBe('loaded')
  })

  it('emit without windowId broadcasts; with windowId sends to that window only', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    await host.call('hello', 'start', null, 1)
    expect(broadcast).toHaveBeenCalledWith('apps:event', 'hello', 'tick', 1)
    expect(sendTo).not.toHaveBeenCalled()
    installFixture('emitter', '1.0.0', "exports.activate = function (v) { v.app.emit('x', 2, { windowId: 9 }) }")
    writeInstalled(dir, [record('hello'), record('emitter')])
    await make().start()
    expect(sendTo).toHaveBeenCalledWith(9, 'apps:event', 'emitter', 'x', 2)
  })

  it('disposeWindow runs onClose listeners', async () => {
    installFixture('closer', '1.0.0', "exports.activate = function (v) { v.windows.onClose((id) => { globalThis.__closed = id }) }")
    writeInstalled(dir, [record('closer')])
    const host = make()
    await host.start()
    host.disposeWindow(42)
    expect((globalThis as { __closed?: number }).__closed).toBe(42)
  })

  it('uninstall of an activated main app is restart-required', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    expect(await host.uninstall('hello')).toEqual({ ok: true })
    expect(host.list().find((a) => a.id === 'hello')?.status).toBe('restart-required')
    expect(broadcast).toHaveBeenCalledWith('apps:changed')
  })

  it('uninstall of a renderer-only app removes it immediately', async () => {
    const t = installFixture('plain')
    const m = JSON.parse(readFileSync(join(t, 'manifest.json'), 'utf8'))
    delete m.main
    writeFileSync(join(t, 'manifest.json'), JSON.stringify(m))
    writeInstalled(dir, [record('plain')])
    const host = make()
    await host.start()
    expect(await host.uninstall('plain')).toEqual({ ok: true })
    expect(host.list().find((a) => a.id === 'plain')).toBeUndefined()
  })

  it('update of an activated main app is restart-required', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    getListing.mockResolvedValue({ id: 'hello' })
    installer.install.mockResolvedValue({ ok: true, record: record('hello', '1.1.0'), previous: record('hello') })
    expect(await host.install('hello')).toMatchObject({ ok: true, id: 'hello' })
    expect(host.list().find((a) => a.id === 'hello')?.status).toBe('restart-required')
  })

  describe('setEnabled', () => {
    const flag = () => JSON.parse(readFileSync(join(dir, 'installed.json'), 'utf8'))[0].disabled

    it('start lists a disabled app as disabled without activating main.js', async () => {
      installFixture()
      writeInstalled(dir, [{ ...record('hello'), disabled: true as const }])
      const host = make()
      await host.start()
      expect(host.list().find((a) => a.id === 'hello')?.status).toBe('disabled')
      await expect(host.call('hello', 'ping', 1, 5)).rejects.toThrow(/No handler/)
    })

    it('enabling a disabled-at-startup app loads it now and clears the flag', async () => {
      installFixture()
      writeInstalled(dir, [{ ...record('hello'), disabled: true as const }])
      installer.installDir = (id, v) => join(dir, id, v)
      const host = make()
      await host.start()
      expect(await host.setEnabled('hello', true)).toEqual({ ok: true })
      expect(host.list().find((a) => a.id === 'hello')?.status).toBe('loaded')
      await expect(host.call('hello', 'ping', 1, 5)).resolves.toEqual({ pong: 1 })
      expect(flag()).toBeUndefined()
      expect(broadcast).toHaveBeenCalledWith('apps:changed')
    })

    it('disabling at runtime persists the flag; main keeps running and enabling just flips back', async () => {
      installFixture()
      writeInstalled(dir, [record('hello')])
      const host = make()
      await host.start()
      expect(await host.setEnabled('hello', false)).toEqual({ ok: true })
      expect(host.list().find((a) => a.id === 'hello')?.status).toBe('disabled')
      expect(flag()).toBe(true)
      await expect(host.call('hello', 'ping', 2, 5)).resolves.toEqual({ pong: 2 })
      expect(await host.setEnabled('hello', true)).toEqual({ ok: true })
      expect(host.list().find((a) => a.id === 'hello')?.status).toBe('loaded')
      expect(flag()).toBeUndefined()
    })

    it('refuses dev apps and unknown ids', async () => {
      const host = make(true)
      await host.start()
      expect(await host.setEnabled('nope', false)).toMatchObject({ ok: false })
    })

    it('an update keeps a disabled app disabled', async () => {
      installFixture()
      writeInstalled(dir, [{ ...record('hello'), disabled: true as const }])
      const host = make()
      await host.start()
      installFixture('hello', '1.1.0')
      writeInstalled(dir, [{ ...record('hello', '1.1.0'), disabled: true as const }])
      getListing.mockResolvedValue({ id: 'hello' })
      installer.install.mockResolvedValue({ ok: true, record: { ...record('hello', '1.1.0'), disabled: true }, previous: record('hello') })
      expect(await host.install('hello')).toMatchObject({ ok: true })
      const info = host.list().find((a) => a.id === 'hello')
      expect(info?.status).toBe('disabled')
      expect(info?.version).toBe('1.1.0')
    })
  })

  it('install loads a new app and reports unknown listing', async () => {
    const host = make()
    await host.start()
    getListing.mockResolvedValue(null)
    expect(await host.install('hello')).toMatchObject({ ok: false })
    getListing.mockImplementation(async () => {
      installFixture()
      return { id: 'hello' }
    })
    installer.install.mockImplementation(async () => {
      writeInstalled(dir, [record('hello')])
      return { ok: true, record: record('hello') }
    })
    expect(await host.install('hello')).toMatchObject({ ok: true, id: 'hello' })
    expect(host.list()[0]).toMatchObject({ id: 'hello', status: 'loaded' })
  })

  it('loadDevFolder refuses when not dev', async () => {
    const host = make(false)
    expect(await host.loadDevFolder(FIXTURE)).toMatchObject({ ok: false })
  })

  it('loadDevFolder loads a folder and persists it', async () => {
    const host = make(true)
    await host.start()
    expect(await host.loadDevFolder(FIXTURE)).toEqual({ ok: true, id: 'hello' })
    expect(host.list()[0]).toMatchObject({ id: 'hello', source: 'dev', status: 'loaded' })
    expect(JSON.parse(readFileSync(join(dir, 'dev.json'), 'utf8'))).toEqual([FIXTURE])
    const again = make(true)
    await again.start()
    expect(again.list()[0]).toMatchObject({ id: 'hello', source: 'dev' })
    expect(again.rootFor('hello')).toBe(FIXTURE)
    again.unloadDev('hello')
    expect(again.list()).toHaveLength(0)
    expect(JSON.parse(readFileSync(join(dir, 'dev.json'), 'utf8'))).toEqual([])
  })

  it('a bad manifest returns its reason', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'badapp-'))
    writeFileSync(join(bad, 'manifest.json'), JSON.stringify({ id: 'X!' }))
    const host = make(true)
    const r = await host.loadDevFolder(bad)
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toMatch(/bad id/)
    rmSync(bad, { recursive: true, force: true })
  })

  it('async activate that rejects is failed and cleaned up, others load', async () => {
    installFixture('bad', '1.0.0', "exports.activate = async function (v) { v.windows.onClose(() => {}); v.app.handle('x', () => 1); throw new Error('boom') }")
    installFixture('hello')
    writeInstalled(dir, [record('bad'), record('hello')])
    const host = make()
    await host.start()
    expect(host.list().find((a) => a.id === 'bad')).toMatchObject({ status: 'failed', error: 'boom' })
    expect(host.list().find((a) => a.id === 'hello')?.status).toBe('loaded')
    await expect(host.call('bad', 'x', null, 1)).rejects.toThrow(/No handler/)
  })

  it('rootFor after update is the new dir; after uninstall is null', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    getListing.mockResolvedValue({ id: 'hello' })
    installer.install.mockResolvedValue({ ok: true, record: record('hello', '1.1.0') })
    await host.install('hello')
    expect(host.rootFor('hello')).toBe(join(dir, 'hello', '1.1.0'))
    await host.uninstall('hello')
    expect(host.rootFor('hello')).toBeNull()
    expect(host.list().find((a) => a.id === 'hello')?.status).toBe('restart-required')
  })

  it('install returns ok:false when getListing throws', async () => {
    const host = make()
    await host.start()
    getListing.mockRejectedValue(new Error('offline'))
    expect(await host.install('hello')).toEqual({ ok: false, error: 'offline' })
    installer.uninstall.mockImplementation(() => { throw new Error('disk') })
    expect(await host.uninstall('hello')).toEqual({ ok: false, error: 'disk' })
  })

  const SPAWNER = "exports.activate = function (v) { v.app.handle('go', (p, ctx) => { global.__kill = []; for (const w of [1, undefined]) { const c = v.process.spawn('node', ['-e', 'setInterval(()=>{},1000)'], { onExit: (code) => global.__kill.push(code) }, { windowId: w }) } return true }) }"

  it('disposeWindow kills children of that window; uninstall kills the rest', async () => {
    installFixture('sp', '1.0.0', SPAWNER)
    writeInstalled(dir, [record('sp')])
    const host = make()
    await host.start()
    await host.call('sp', 'go', null, 1)
    await new Promise((r) => setTimeout(r, 300))
    host.disposeWindow(1)
    await new Promise((r) => setTimeout(r, 300))
    expect((globalThis as any).__kill).toHaveLength(1)
    await host.uninstall('sp')
    await new Promise((r) => setTimeout(r, 300))
    expect((globalThis as any).__kill).toHaveLength(2)
  })

  it('disabling kills the processes the app started', async () => {
    installFixture('sp', '1.0.0', SPAWNER)
    writeInstalled(dir, [record('sp')])
    const host = make()
    await host.start()
    await host.call('sp', 'go', null, 1)
    await new Promise((r) => setTimeout(r, 300))
    await host.setEnabled('sp', false)
    await new Promise((r) => setTimeout(r, 300))
    expect((globalThis as any).__kill).toHaveLength(2)
  })

  it('reloading a dev folder deactivates the old module', async () => {
    const host = make(true)
    await host.start()
    await host.loadDevFolder(FIXTURE)
    const first = (host as any).entries.get('hello')
    const spy = vi.fn()
    first.mainModule = { deactivate: spy }
    await host.loadDevFolder(FIXTURE)
    expect(spy).toHaveBeenCalled()
    expect(first.handlers.size).toBe(0)
  })

  it('rootFor returns the install dir, null for unknown', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    const host = make()
    await host.start()
    expect(host.rootFor('hello')).toBe(join(dir, 'hello', '1.0.0'))
    expect(host.rootFor('nope')).toBeNull()
  })

  it('start broadcasts apps:changed so an early window re-asks', async () => {
    installFixture()
    writeInstalled(dir, [record('hello')])
    await make().start()
    expect(broadcast).toHaveBeenCalledWith('apps:changed')
  })

  it('a reloaded dev folder gets a fresh renderer URL', async () => {
    const devDir = join(dir, 'devsrc')
    cpSync(FIXTURE, devDir, { recursive: true })
    const host = make(true)
    await host.loadDevFolder(devDir)
    const first = host.list()[0].rendererUrl
    await host.loadDevFolder(devDir)
    const second = host.list()[0].rendererUrl
    expect(first).not.toBe(second)
    expect(second).toMatch(/^vide-app:\/\/hello\/renderer\.js\?v=1\.0\.0-\d+$/)
  })

  it('install reports an error when the id is taken by a dev app', async () => {
    const devDir = join(dir, 'devsrc')
    cpSync(FIXTURE, devDir, { recursive: true })
    const host = make(true)
    await host.loadDevFolder(devDir)
    installFixture('hello', '1.0.0')
    getListing.mockResolvedValue({ id: 'hello' })
    installer.install.mockResolvedValue({ ok: true, record: record('hello') })
    const res = await host.install('hello')
    expect(res.ok).toBe(false)
    expect(installer.install).not.toHaveBeenCalled()
    expect(host.list()[0].source).toBe('dev')
  })
})
