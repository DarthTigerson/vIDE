import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resetChannelsForTest, allChannelNames } from '../dispatch'
import { registerAllRelayChannels } from '../registerAll'
import { EXCLUDED_CHANNELS } from '../excludedChannels'

function extractPreloadChannels(): string[] {
  const source = readFileSync(join(__dirname, '../../preload.ts'), 'utf-8')
  const matches = [...source.matchAll(/ipcRenderer\.(?:invoke|send)\('([^']+)'/g)]
  return [...new Set(matches.map((m) => m[1]))]
}

describe('mobile relay channel coverage', () => {
  it('has a dispatch entry or a documented exclusion for every preload.ts channel', () => {
    resetChannelsForTest()
    const fakeDeps = {
      ptyManager: {
        spawn: vi.fn(),
        kill: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
      } as never,
      claudeManager: {
        spawn: vi.fn(),
        kill: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
      } as never,
      win: { id: 1 } as never,
      usageManager: {
        acquire: vi.fn(),
        release: vi.fn(),
        getLatest: vi.fn(),
        getRange: vi.fn(),
        getPassiveEnabled: vi.fn(),
        setPassiveEnabled: vi.fn(),
      } as never,
      bridgeManager: {
        send: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
        cancel: vi.fn(),
        testConnection: vi.fn(),
        disposeWindow: vi.fn(),
      } as never,
      autocompleteManager: {
        complete: vi.fn(),
        disposeWindow: vi.fn(),
      } as never,
      inlineEditManager: {
        start: vi.fn(),
        cancel: vi.fn(),
        disposeWindow: vi.fn(),
      } as never,
      commitMessageManager: {
        generate: vi.fn(),
        disposeWindow: vi.fn(),
      } as never,
    }
    registerAllRelayChannels(fakeDeps)
    const registered = new Set(allChannelNames())
    const missing = extractPreloadChannels().filter(
      (ch) => !registered.has(ch) && !EXCLUDED_CHANNELS.has(ch)
    )
    expect(missing).toEqual([])
  })
})
