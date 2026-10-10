import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

import { agentLabel, availableAgents, isBridgeLike, isLlamaKind, llamaModelId, agentModeOnLaunchFor } from '../agentKinds'
import { defaultLlamaModelConfig, useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'

const qwen = { ...defaultLlamaModelConfig(), id: 'q1', displayName: 'Qwen 32B', alias: 'qwen', enabled: true }
const off = { ...defaultLlamaModelConfig(), id: 'o1', displayName: 'Off', enabled: false }
const unnamed = { ...defaultLlamaModelConfig(), id: 'u1', displayName: '', alias: '', enabled: true }

describe('agentKinds', () => {
  it('classifies kinds', () => {
    expect(isLlamaKind('llama:q1')).toBe(true)
    expect(isLlamaKind('bridge')).toBe(false)
    expect(llamaModelId('llama:q1')).toBe('q1')
    expect(llamaModelId('claude')).toBe('')
    expect(isBridgeLike('bridge')).toBe(true)
    expect(isBridgeLike('llama:q1')).toBe(true)
    expect(isBridgeLike('claude')).toBe(false)
  })

  it('labels kinds, falling back for unnamed or missing llama models', () => {
    expect(agentLabel('claude', [])).toBe('Claude Code')
    expect(agentLabel('bridge', [])).toBe('Bridge')
    expect(agentLabel('llama:q1', [qwen])).toBe('Qwen 32B')
    expect(agentLabel('llama:u1', [unnamed])).toBe('Llama Model')
    expect(agentLabel('llama:gone', [])).toBe('Llama Model')
  })

  it('lists enabled built-ins then enabled llama models', () => {
    expect(availableAgents({ claude: true, bridge: false }, [qwen, off])).toEqual([
      { kind: 'claude', label: 'Claude Code' },
      { kind: 'llama:q1', label: 'Qwen 32B' },
    ])
    expect(availableAgents({ claude: false, bridge: true }, [])).toEqual([{ kind: 'bridge', label: 'Bridge' }])
  })

  it('agent mode on launch: per-model override, then llama default, then bridge setting', () => {
    useLlamaModelsStore.setState({ models: [{ ...qwen, agentModeOnLaunch: true }] })
    useLlamaSettingsStore.setState({ agentModeOnLaunch: false })
    useBridgeSettingsStore.setState({ agentModeOnLaunch: true })
    expect(agentModeOnLaunchFor('llama:q1')).toBe(true)
    expect(agentModeOnLaunchFor('llama:gone')).toBe(false)
    expect(agentModeOnLaunchFor('bridge')).toBe(true)
    expect(agentModeOnLaunchFor('claude')).toBe(false)
  })
})
