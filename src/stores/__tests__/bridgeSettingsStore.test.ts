import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useBridgeSettingsStore } from '../bridgeSettingsStore'

describe('bridgeSettingsStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    useBridgeSettingsStore.setState({ endpoint: '', apiKey: '', modelId: '' })
  })

  it('has empty defaults', () => {
    const s = useBridgeSettingsStore.getState()
    expect(s.endpoint).toBe('')
    expect(s.apiKey).toBe('')
    expect(s.modelId).toBe('')
  })

  it('setEndpoint persists to localStorage', () => {
    useBridgeSettingsStore.getState().setEndpoint('http://169.254.238.138:8002/v1')
    expect(useBridgeSettingsStore.getState().endpoint).toBe('http://169.254.238.138:8002/v1')
    expect(store['vide:bridge:endpoint']).toBe('http://169.254.238.138:8002/v1')
  })

  it('setApiKey persists to localStorage', () => {
    useBridgeSettingsStore.getState().setApiKey('local')
    expect(store['vide:bridge:apiKey']).toBe('local')
  })

  it('setModelId persists to localStorage', () => {
    useBridgeSettingsStore.getState().setModelId('mlx-community/Qwen2.5-Coder-32B')
    expect(store['vide:bridge:modelId']).toBe('mlx-community/Qwen2.5-Coder-32B')
  })
})
