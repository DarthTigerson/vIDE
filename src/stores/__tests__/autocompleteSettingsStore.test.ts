import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  // An existing user of the old Claude autocomplete, whose toggle defaulted on.
  const store: Record<string, string> = { 'vide:autocomplete:enabled': 'true', 'vide:autocomplete:model': 'claude-haiku-4-5-20251001' }
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useAutocompleteSettingsStore, resolveSource } from '../autocompleteSettingsStore'

const GiB = 1024 ** 3
const initial = useAutocompleteSettingsStore.getState()

describe('autocompleteSettingsStore', () => {
  beforeEach(() => {
    useAutocompleteSettingsStore.setState(initial)
  })

  it('stays off for a user upgrading with the old enabled key set', () => {
    expect(initial.enabled).toBe(false)
  })

  it('defaults to the recommended model, started with vIDE', () => {
    expect(initial.model).toBe('recommended')
    expect(initial.autoStart).toBe(true)
    expect(initial.customKind).toBe('gguf')
    expect(initial.serverUrl).toBe('http://127.0.0.1:8012')
  })

  it('persists settings under the machine-local key prefix', () => {
    useAutocompleteSettingsStore.getState().setEnabled(true)
    useAutocompleteSettingsStore.getState().setAutoStart(false)
    expect(store['vide:autocomplete:local:enabled']).toBe('true')
    expect(store['vide:autocomplete:local:autoStart']).toBe('false')
  })
})

describe('resolveSource', () => {
  const on = { ...initial, enabled: true }

  it('is null while autocomplete is off', () => {
    expect(resolveSource({ ...on, enabled: false }, 32 * GiB)).toBeNull()
  })

  it('turns "recommended" into the model for this machine', () => {
    expect(resolveSource(on, 32 * GiB)).toEqual({ kind: 'managed', modelId: 'qwen-3b' })
    expect(resolveSource(on, 8 * GiB)).toEqual({ kind: 'managed', modelId: 'qwen-1.5b' })
  })

  it('passes an explicit managed model through', () => {
    expect(resolveSource({ ...on, model: 'mellum-4b' }, 8 * GiB)).toEqual({ kind: 'managed', modelId: 'mellum-4b' })
  })

  it('builds a custom server source', () => {
    expect(resolveSource({ ...on, model: 'custom', customKind: 'server', serverUrl: 'http://h:1', serverApi: 'openai', serverKey: 'k' }, 8 * GiB))
      .toEqual({ kind: 'server', baseUrl: 'http://h:1', api: 'openai', apiKey: 'k' })
  })

  it('builds a custom GGUF source', () => {
    expect(resolveSource({ ...on, model: 'custom', customKind: 'gguf', ggufPath: '/m.gguf', extraArgs: '-t 4' }, 8 * GiB))
      .toEqual({ kind: 'gguf', path: '/m.gguf', extraArgs: '-t 4' })
  })
})
