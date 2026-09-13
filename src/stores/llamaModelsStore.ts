import { create } from 'zustand'

// Types mirror the "Recommended Internal Structure" in
// notes/vIDE/Bridge/create-model-instructions.md — llama-server launch args
// plus vIDE-managed fields (displayName, enabled, autoStart) that are NOT
// command-line arguments.

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'
export const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh']
export const CONTEXT_SIZE_OPTIONS = [16384, 32768, 65536, 131072, 262144]

export interface LlamaModelConfig {
  id: string
  displayName: string
  alias: string
  enabled: boolean

  modelPath: string
  serverExecutable: string

  host: string
  port: number
  apiKey: string

  contextSize: number
  batchSize: number
  gpuLayers: number
  parallelRequests: number
  reasoningEffort: ReasoningEffort

  autoStart: boolean
}

// vIDE agent settings (NOT llama.cpp launch arguments) — currently just the
// Bridge tool-call cap. Future: compaction thresholds, memory, diary, MCP and
// tool permissions, unattended execution.
export interface BridgeAgentConfig {
  toolCallLimit: number // 0 = unlimited
}

// Defaults come from the "Current Cosmos Configuration" in the instructions
// note — the known-good values for the current Apple Silicon setup.
export function defaultLlamaModelConfig(): LlamaModelConfig {
  return {
    id: crypto.randomUUID(),
    displayName: '',
    alias: '',
    enabled: true,

    modelPath: '',
    serverExecutable: '',

    host: '127.0.0.1',
    port: 8899,
    apiKey: 'local',

    contextSize: 131072,
    batchSize: 256,
    gpuLayers: 99,
    parallelRequests: 1,
    reasoningEffort: 'medium',

    autoStart: true,
  }
}

export function defaultBridgeAgentConfig(): BridgeAgentConfig {
  return { toolCallLimit: 0 }
}

const STORAGE_KEY = 'vide:llama:models'
const BRIDGE_AGENT_KEY = 'vide:llama:bridgeAgent'

function loadModels(): LlamaModelConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LlamaModelConfig[]) : []
  } catch {
    return []
  }
}

function saveModels(models: LlamaModelConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models))
  } catch {}
}

function loadBridgeAgent(): BridgeAgentConfig {
  try {
    const raw = localStorage.getItem(BRIDGE_AGENT_KEY)
    if (!raw) return defaultBridgeAgentConfig()
    const parsed = JSON.parse(raw)
    if (typeof parsed?.toolCallLimit === 'number') return parsed
    return defaultBridgeAgentConfig()
  } catch {
    return defaultBridgeAgentConfig()
  }
}

interface LlamaModelsStore {
  models: LlamaModelConfig[]
  bridgeAgent: BridgeAgentConfig
  // null = the page is editing a new (not-yet-saved) model.
  getModels: () => LlamaModelConfig[]
  getModel: (id: string) => LlamaModelConfig | undefined
  upsertModel: (config: LlamaModelConfig) => void
  removeModel: (id: string) => void
  setBridgeAgent: (patch: Partial<BridgeAgentConfig>) => void
}

export const useLlamaModelsStore = create<LlamaModelsStore>((set, get) => ({
  models: loadModels(),
  bridgeAgent: loadBridgeAgent(),

  getModels: () => get().models,
  getModel: (id) => get().models.find((m) => m.id === id),

  upsertModel: (config) => {
    const models = get().models
    const idx = models.findIndex((m) => m.id === config.id)
    const next = idx === -1 ? [...models, config] : models.map((m) => (m.id === config.id ? config : m))
    saveModels(next)
    set({ models: next })
  },

  removeModel: (id) => {
    const next = get().models.filter((m) => m.id !== id)
    saveModels(next)
    set({ models: next })
  },

  setBridgeAgent: (patch) => {
    const next = { ...get().bridgeAgent, ...patch }
    try {
      localStorage.setItem(BRIDGE_AGENT_KEY, JSON.stringify(next))
    } catch {}
    set({ bridgeAgent: next })
  },
}))
