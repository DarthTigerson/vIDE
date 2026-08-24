import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const { ipcHandlers } = vi.hoisted(() => ({
  ipcHandlers: {} as Record<string, (...args: any[]) => unknown>,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => { ipcHandlers[channel] = fn },
  },
}))

const pollerInstances: any[] = []
vi.mock('../usagePoller', () => ({
  UsagePoller: vi.fn().mockImplementation((_historyFile, _settingsFile, onSnapshot) => {
    const instance = {
      start: vi.fn(),
      stop: vi.fn(),
      getLatest: vi.fn(() => null),
      getRange: vi.fn(() => []),
      onSnapshot,
    }
    pollerInstances.push(instance)
    return instance
  }),
}))

import { UsageManager } from '../usageManager'

function fakeWin() {
  return { webContents: { send: vi.fn() } } as any
}

describe('UsageManager', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-usage-manager-test-'))
    pollerInstances.length = 0
    for (const key of Object.keys(ipcHandlers)) delete ipcHandlers[key]
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function paths() {
    return [join(dir, 'history.jsonl'), join(dir, 'poll-settings.json'), join(dir, 'passive-settings.json')] as const
  }

  it('does not start the poller when nothing has acquired it', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    expect(pollerInstances[0].start).not.toHaveBeenCalled()
  })

  it('starts the poller on the first acquire and not again on a second', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    mgr.acquire('mobile')
    mgr.acquire('desktop')
    expect(pollerInstances[0].start).toHaveBeenCalledTimes(1)
  })

  it('only stops the poller once the last source releases', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    mgr.acquire('mobile')
    mgr.acquire('desktop')
    mgr.release('mobile')
    expect(pollerInstances[0].stop).not.toHaveBeenCalled()
    mgr.release('desktop')
    expect(pollerInstances[0].stop).toHaveBeenCalledTimes(1)
  })

  it('releasing a source that was never acquired never started the poller in the first place', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    mgr.release('desktop')
    expect(pollerInstances[0].start).not.toHaveBeenCalled()
  })

  it('defaults passive monitoring to off with no settings file', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    expect(mgr.getPassiveEnabled()).toBe(false)
    expect(pollerInstances[0].start).not.toHaveBeenCalled()
  })

  it('starts the poller immediately when the passive setting was already on', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    writeFileSync(passiveSettingsFile, JSON.stringify({ enabled: true }))
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    expect(mgr.getPassiveEnabled()).toBe(true)
    expect(pollerInstances[0].start).toHaveBeenCalledTimes(1)
  })

  it('setPassiveEnabled(true) persists and starts, setPassiveEnabled(false) persists and stops', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())

    mgr.setPassiveEnabled(true)
    expect(pollerInstances[0].start).toHaveBeenCalledTimes(1)

    const reloaded = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    expect(reloaded.getPassiveEnabled()).toBe(true)

    mgr.setPassiveEnabled(false)
    expect(pollerInstances[0].stop).toHaveBeenCalledTimes(1)
  })

  it('passive setting does not mask a viewer stopping the poller for others', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
    mgr.acquire('desktop')
    mgr.release('desktop')
    expect(pollerInstances[0].stop).toHaveBeenCalledTimes(1)
  })

  it('broadcasts usage:update to the window when the poller reports a snapshot', () => {
    const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
    const win = fakeWin()
    new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, win)
    const latest = { ts: 1, sessionPct: 10 }
    pollerInstances[0].getLatest.mockReturnValue(latest)

    pollerInstances[0].onSnapshot({ ts: 1, sessionPct: 10 })

    expect(win.webContents.send).toHaveBeenCalledWith('usage:update', latest)
  })

  describe('registerHandlers', () => {
    it('wires usage:acquire/release/getLatest/getPassiveEnabled/setPassiveEnabled', async () => {
      const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
      const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
      mgr.registerHandlers()

      await ipcHandlers['usage:acquire']()
      expect(pollerInstances[0].start).toHaveBeenCalledTimes(1)

      pollerInstances[0].getLatest.mockReturnValue({ ts: 1 })
      expect(await ipcHandlers['usage:getLatest']()).toEqual({ ts: 1 })

      expect(await ipcHandlers['usage:getPassiveEnabled']()).toBe(false)
      await ipcHandlers['usage:setPassiveEnabled'](null, true)
      expect(await ipcHandlers['usage:getPassiveEnabled']()).toBe(true)

      await ipcHandlers['usage:release']()
      expect(pollerInstances[0].stop).not.toHaveBeenCalled() // passive is now on, keeps it running
    })

    it('wires usage:getRange to the poller, forwarding the from/to/maxPoints arguments', async () => {
      const [historyFile, pollSettingsFile, passiveSettingsFile] = paths()
      const mgr = new UsageManager(historyFile, pollSettingsFile, passiveSettingsFile, fakeWin())
      mgr.registerHandlers()

      pollerInstances[0].getRange.mockReturnValue([{ ts: 1, sessionPct: 5 }])
      const result = await ipcHandlers['usage:getRange'](null, 0, 1000, 50)

      expect(result).toEqual([{ ts: 1, sessionPct: 5 }])
      expect(pollerInstances[0].getRange).toHaveBeenCalledWith(0, 1000, 50)
    })
  })
})
