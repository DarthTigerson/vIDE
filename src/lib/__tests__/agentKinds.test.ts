import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

import { agentLabel, availableAgents, isBridgeLike, isClaudeLike, isLlamaKind, llamaModelId, agentModeOnLaunchFor, llamaConnectionFor, AUTO_OPTIMIZE_COMPACT_AT } from '../agentKinds'
import { defaultLlamaModelConfig, useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'

const qwen = { ...defaultLlamaModelConfig(), id: 'q1', displayName: 'Qwen 32B', alias: 'qwen', enabled: true }
const off = { ...defaultLlamaModelConfig(), id: 'o1', displayName: 'Off', enabled: false }
const unnamed = { ...defaultLlamaModelConfig(), id: 'u1', displayName: '', alias: '', enabled: true }

describe('agentKinds', () => {
  it('caps compaction for Auto-optimize models only, and passes the model reasoning effort', () => {
    const auto = { ...qwen, autoOptimize: true }
    const fixed = { ...qwen, autoOptimize: false }
    expect(llamaConnectionFor('llama:q1', [auto], 40)).toMatchObject({ compactAtTokens: AUTO_OPTIMIZE_COMPACT_AT, reasoningEffort: 'medium' })
    expect(llamaConnectionFor('llama:q1', [fixed], 40)?.compactAtTokens).toBeUndefined()
  })

  it('classifies kinds', () => {
    expect(isLlamaKind('llama:q1')).toBe(true)
    expect(isLlamaKind('bridge')).toBe(false)
    expect(llamaModelId('llama:q1')).toBe('q1')
    expect(llamaModelId('claude')).toBe('')
    expect(isBridgeLike('bridge')).toBe(true)
    expect(isBridgeLike('llama:q1')).toBe(true)
    expect(isBridgeLike('claude')).toBe(false)
    expect(isBridgeLike('rocky')).toBe(false)
    expect(isClaudeLike('claude')).toBe(true)
    expect(isClaudeLike('rocky')).toBe(true)
    expect(isClaudeLike('bridge')).toBe(false)
    expect(isClaudeLike(undefined)).toBe(false)
  })

  it('labels kinds, falling back for unnamed or missing llama models', () => {
    expect(agentLabel('claude', [])).toBe('Claude Code')
    expect(agentLabel('rocky', [])).toBe('Rocky Code')
    expect(agentLabel('bridge', [])).toBe('Bridge')
    expect(agentLabel('llama:q1', [qwen])).toBe('Qwen 32B')
    expect(agentLabel('llama:u1', [unnamed])).toBe('Llama Model')
    expect(agentLabel('llama:gone', [])).toBe('Llama Model')
  })

  it('lists enabled built-ins then enabled llama models', () => {
    expect(availableAgents({ claude: true, bridge: false }, [qwen, off])).toEqual([
      { kind: 'claude', label: 'Claude Code' },
      { kind: 'rocky', label: 'Rocky Code' },
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
