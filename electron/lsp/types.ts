export type LspServerId = 'typescript' | 'python' | 'go' | 'rust' | 'yaml' | 'json'

export interface DetectResult {
  found: boolean
  path?: string
  version?: string
}

export interface SpawnSpec {
  command: string
  args: string[]
}

export interface LspServerModule {
  id: LspServerId
  label: string
  monacoLanguageIds: string[]
  // Static approximate figure shown in Settings — real per-process
  // measurement was ruled out for v1, see docs/superpowers/specs.
  ramEstimate: string
  detect(): Promise<DetectResult>
  getSpawn(): Promise<SpawnSpec | null>
  // All four installers are global (npm -g, go install ..., a home-dir
  // download) — there's no project-scoped install here, so no cwd.
  install(onData: (chunk: string) => void): Promise<void>
}

export interface DefinitionLocation {
  path: string
  line: number
  col: number
}
