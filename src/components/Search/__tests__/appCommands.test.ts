import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appCommands, resetAppCommandsForTests } from '../appCommands'
import { useAppContribStore } from '@/apps/appContribStore'
import type { AppInfo } from '@/types/api'

const flush = () => new Promise((r) => setTimeout(r, 0))

function stubApi(isDev: boolean) {
  const api = {
    appsIsDev: vi.fn().mockResolvedValue(isDev),
    appsLoadDevFolder: vi.fn().mockResolvedValue({ ok: true, id: 'hello' }),
    appsUnloadDev: vi.fn().mockResolvedValue(undefined),
  }
  ;(globalThis as unknown as { window: unknown }).window = { api }
  return api
}

const devApp = { id: 'hello', name: 'Hello', version: '1.0.0', source: 'dev', rendererUrl: 'vide-app://hello/renderer.js?v=1.0.0', hasMain: false, contributes: {}, status: 'loaded' } as AppInfo

beforeEach(() => resetAppCommandsForTests())
afterEach(() => {
  useAppContribStore.getState().setApps([])
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('appCommands', () => {
  it('returns the commands store apps registered', async () => {
    stubApi(false)
    await flush()
    expect(appCommands()).toEqual([])
    const command = { id: 'app:hello:wave', label: 'Hello: Wave', action: () => {} }
    useAppContribStore.getState().registerCommand({ appId: 'hello', command })
    expect(appCommands()).toEqual([command])
    useAppContribStore.getState().clearApp('hello')
  })

  it('lists no dev commands in a packaged build', async () => {
    stubApi(false)
    appCommands()
    await flush()
    expect(appCommands().map((c) => c.label)).not.toContain('Load app from folder…')
  })

  it('lists Load and one Unload per dev app in a dev build', async () => {
    const api = stubApi(true)
    useAppContribStore.getState().setApps([devApp])
    appCommands()
    await flush()
    const cmds = appCommands()
    expect(cmds.map((c) => c.label)).toEqual(['Load app from folder…', 'Unload dev app: Hello'])
    const unload = cmds[1]
    if (unload.action) unload.action()
    expect(api.appsUnloadDev).toHaveBeenCalledWith('hello')
    const load = cmds[0]
    if (load.action) load.action()
    expect(api.appsLoadDevFolder).toHaveBeenCalled()
  })
})
