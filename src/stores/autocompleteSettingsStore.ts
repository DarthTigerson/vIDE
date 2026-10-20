import { create } from 'zustand'
import { recommendedModelId, type ManagedModelId } from '../../electron/autocomplete/catalog'
import type { AutocompleteSource } from '@/types/api'

// Machine-local on purpose: `vide:autocomplete:` is left out of vIDE Sync's
// categories (configRepoStore.ts), because what fits and what is downloaded
// differs per machine, and a synced "enabled + Start with vIDE" must never set
// off a multi-GB download on another computer. The `local:` keys are also new,
// so the old Claude autocomplete's `vide:autocomplete:enabled` (default on)
// can't switch this on for an upgrading user.
const KEYS = {
  enabled: 'vide:autocomplete:local:enabled',
  model: 'vide:autocomplete:local:model',
  autoStart: 'vide:autocomplete:local:autoStart',
  customKind: 'vide:autocomplete:local:customKind',
  ggufPath: 'vide:autocomplete:local:ggufPath',
  extraArgs: 'vide:autocomplete:local:extraArgs',
  serverUrl: 'vide:autocomplete:local:serverUrl',
  serverApi: 'vide:autocomplete:local:serverApi',
  serverKey: 'vide:autocomplete:local:serverKey',
  projectContext: 'vide:autocomplete:local:projectContext',
}

export type AutocompleteModelChoice = ManagedModelId | 'recommended' | 'custom'
const MODEL_CHOICES: AutocompleteModelChoice[] = ['recommended', 'qwen-1.5b', 'qwen-3b', 'mellum-4b', 'custom']

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch {}
}

function readChoice<T extends string>(key: string, options: readonly T[], def: T): T {
  const value = read(key)
  return value !== null && (options as readonly string[]).includes(value) ? value as T : def
}

export interface AutocompleteSettings {
  enabled: boolean
  model: AutocompleteModelChoice
  autoStart: boolean
  customKind: 'gguf' | 'server'
  ggufPath: string
  extraArgs: string
  serverUrl: string
  serverApi: 'infill' | 'openai'
  serverKey: string
  // Send definitions from the project graph and matching parts of open tabs
  // with each request. Off by default: on vIDE's own code it added ~0.2s per
  // suggestion without a measurable gain in accuracy.
  projectContext: boolean
}

interface AutocompleteSettingsStore extends AutocompleteSettings {
  setEnabled: (value: boolean) => void
  setModel: (value: AutocompleteModelChoice) => void
  setAutoStart: (value: boolean) => void
  setCustomKind: (value: 'gguf' | 'server') => void
  setGgufPath: (value: string) => void
  setExtraArgs: (value: string) => void
  setServerUrl: (value: string) => void
  setServerApi: (value: 'infill' | 'openai') => void
  setServerKey: (value: string) => void
  setProjectContext: (value: boolean) => void
}

export const useAutocompleteSettingsStore = create<AutocompleteSettingsStore>((set) => {
  const setter = <K extends keyof AutocompleteSettings>(key: K) => (value: AutocompleteSettings[K]) => {
    write(KEYS[key], String(value))
    set({ [key]: value } as Pick<AutocompleteSettings, K>)
  }
  return {
    enabled: read(KEYS.enabled) === 'true',
    model: readChoice(KEYS.model, MODEL_CHOICES, 'recommended'),
    autoStart: read(KEYS.autoStart) !== 'false',
    customKind: readChoice(KEYS.customKind, ['gguf', 'server'] as const, 'gguf'),
    ggufPath: read(KEYS.ggufPath) ?? '',
    extraArgs: read(KEYS.extraArgs) ?? '',
    serverUrl: read(KEYS.serverUrl) ?? 'http://127.0.0.1:8012',
    serverApi: readChoice(KEYS.serverApi, ['infill', 'openai'] as const, 'infill'),
    serverKey: read(KEYS.serverKey) ?? '',
    projectContext: read(KEYS.projectContext) === 'true',
    setEnabled: setter('enabled'),
    setModel: setter('model'),
    setAutoStart: setter('autoStart'),
    setCustomKind: setter('customKind'),
    setGgufPath: setter('ggufPath'),
    setExtraArgs: setter('extraArgs'),
    setServerUrl: setter('serverUrl'),
    setServerApi: setter('serverApi'),
    setServerKey: setter('serverKey'),
    setProjectContext: setter('projectContext'),
  }
})

// What the main process should run, from the settings and this machine's RAM.
export function resolveSource(s: AutocompleteSettings, totalBytes: number): AutocompleteSource | null {
  if (!s.enabled) return null
  if (s.model === 'recommended') return { kind: 'managed', modelId: recommendedModelId(totalBytes) }
  if (s.model !== 'custom') return { kind: 'managed', modelId: s.model }
  if (s.customKind === 'server') return { kind: 'server', baseUrl: s.serverUrl, api: s.serverApi, apiKey: s.serverKey }
  return { kind: 'gguf', path: s.ggufPath, extraArgs: s.extraArgs }
}
