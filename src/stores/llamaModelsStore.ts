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
  agentModeOnLaunch: boolean
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
    agentModeOnLaunch: false,
  }
}

const STORAGE_KEY = 'vide:llama:models'

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

interface LlamaModelsStore {
  models: LlamaModelConfig[]
  // null = the page is editing a new (not-yet-saved) model.
  getModels: () => LlamaModelConfig[]
  getModel: (id: string) => LlamaModelConfig | undefined
  upsertModel: (config: LlamaModelConfig) => void
  removeModel: (id: string) => void
}

export const useLlamaModelsStore = create<LlamaModelsStore>((set, get) => ({
  models: loadModels(),

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
}))
