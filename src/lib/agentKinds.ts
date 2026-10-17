import type { AssistantKind } from '@/types/api'
import type { LlamaModelConfig } from '@/stores/llamaModelsStore'
import { useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'

const LLAMA_PREFIX = 'llama:'

// A plain shell session in the agent bar — not an agent, never persisted, so
// it is never offered by availableAgents() (the "+" menu adds it separately).
export const TERMINAL_KIND: AssistantKind = 'terminal'

export interface AgentOption {
  kind: AssistantKind
  label: string
}

const BUILT_INS: AgentOption[] = [
  { kind: 'claude', label: 'Claude Code' },
  { kind: 'bridge', label: 'Bridge' },
]

export function isLlamaKind(kind: AssistantKind): boolean {
  return kind.startsWith(LLAMA_PREFIX)
}

export function llamaModelId(kind: AssistantKind): string {
  return isLlamaKind(kind) ? kind.slice(LLAMA_PREFIX.length) : ''
}

export function isTerminalKind(kind: AssistantKind): boolean {
  return kind === TERMINAL_KIND
}

// Bridge and llama sessions share BridgeChat/bridgeStore; Claude and
// terminal sessions each run a PTY.
export function isBridgeLike(kind: AssistantKind): boolean {
  return kind === 'bridge' || isLlamaKind(kind)
}

function llamaLabel(model: LlamaModelConfig | undefined): string {
  return model?.displayName || model?.alias || 'Llama Model'
}

export function agentLabel(kind: AssistantKind, llamaModels: LlamaModelConfig[]): string {
  const builtIn = BUILT_INS.find((o) => o.kind === kind)
  if (builtIn) return builtIn.label
  if (isTerminalKind(kind)) return 'Terminal'
  return llamaLabel(llamaModels.find((m) => m.id === llamaModelId(kind)))
}

// What the "+" menu and the palette offer: every enabled agent, whether or
// not a llama server is running yet — Chat starts it on first send.
export function availableAgents(enabled: Record<string, boolean>, llamaModels: LlamaModelConfig[]): AgentOption[] {
  return [
    ...BUILT_INS.filter((o) => enabled[o.kind]),
    ...llamaModels.filter((m) => m.enabled).map((m) => ({ kind: `${LLAMA_PREFIX}${m.id}`, label: llamaLabel(m) })),
  ]
}

export function agentModeOnLaunchFor(kind: AssistantKind): boolean {
  if (isLlamaKind(kind)) {
    const model = useLlamaModelsStore.getState().models.find((m) => m.id === llamaModelId(kind))
    return model?.agentModeOnLaunch ?? useLlamaSettingsStore.getState().agentModeOnLaunch
  }
  if (kind === 'bridge') return useBridgeSettingsStore.getState().agentModeOnLaunch
  return false
}
