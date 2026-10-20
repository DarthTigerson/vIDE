import type { ManagedModelId } from './catalog'

// Mirrored in src/types/api.d.ts for the renderer: keep the two in step.

export type AutocompleteSource =
  | { kind: 'managed'; modelId: ManagedModelId }
  | { kind: 'gguf'; path: string; extraArgs: string }
  | { kind: 'server'; baseUrl: string; api: 'infill' | 'openai'; apiKey: string }

export type AutocompletePhase = 'idle' | 'installing' | 'downloading' | 'starting' | 'running' | 'stopped' | 'error'

export interface AutocompleteRuntimeState {
  phase: AutocompletePhase
  source: AutocompleteSource | null
  // managed: the catalog file was found; gguf: the file exists; server: always true
  modelOnDisk: boolean
  // while installing/downloading
  progress: { received: number; total: number } | null
  // estimate for the configured source; null for a server vIDE doesn't run
  ramBytes: number | null
  error: { kind: 'no-fit' | 'failed'; message: string } | null
}
