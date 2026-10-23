import type { AssistantKind } from '@/types/api'
import type { LlamaModelConfig, ReasoningEffort } from '@/stores/llamaModelsStore'
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

// Rocky Code (VIDE-108) is the Claude CLI with extra launch flags. It isn't
// offered as an agent of its own: the "+" menu's Rocky tab starts Claude as
// it (and Bridge or llama with Rocky's voice), so it only needs a label.
const ROCKY_LABEL = 'Rocky Code'

export function isLlamaKind(kind: AssistantKind): boolean {
  return kind.startsWith(LLAMA_PREFIX)
}

export function llamaModelId(kind: AssistantKind): string {
  return isLlamaKind(kind) ? kind.slice(LLAMA_PREFIX.length) : ''
}

export function isTerminalKind(kind: AssistantKind): boolean {
  return kind === TERMINAL_KIND
}

// A Claude CLI PTY session — plain Claude Code or Rocky Code. Everything
// built on the CLI (Compact, Usage, Cost, sound, restore) keys off this.
export function isClaudeLike(kind: AssistantKind | undefined): boolean {
  return kind === 'claude' || kind === 'rocky'
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
  if (kind === 'rocky') return ROCKY_LABEL
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

// The connection a llama session's chat talks to — Bridge sessions use the
// Bridge settings instead (undefined). A removed or disabled model has none:
// the session is kept, but nothing is sent or launched for it.
export const AUTO_OPTIMIZE_COMPACT_AT = 65_536

export function llamaConnectionFor(
  kind: AssistantKind,
  models: LlamaModelConfig[] = useLlamaModelsStore.getState().models,
  toolCallLimit: number = useLlamaSettingsStore.getState().toolCallLimit,
): { endpoint: string; apiKey: string; modelId: string; toolCallLimit: number; reasoningEffort: ReasoningEffort; compactAtTokens?: number } | undefined {
  if (!isLlamaKind(kind)) return undefined
  const model = models.find((m) => m.id === llamaModelId(kind) && m.enabled)
  if (!model) return undefined
  return {
    endpoint: `http://${model.host}:${model.port}/v1`,
    apiKey: model.apiKey,
    modelId: model.alias || model.displayName || model.id,
    toolCallLimit,
    // The server was launched with this; a session's own choice overrides it per request.
    reasoningEffort: model.reasoningEffort,
    // Auto-optimize lets llama.cpp pick the context, often 200k+; at local
    // prompt-reading speeds a cache miss that deep costs tens of minutes.
    compactAtTokens: model.autoOptimize ? AUTO_OPTIMIZE_COMPACT_AT : undefined,
  }
}
