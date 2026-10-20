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

// Shared shape for every position-based request (definition, completion,
// hover) — line/column are 1-based, as Monaco hands them to us; the manager
// converts to LSP's 0-based positions.
export interface LspPositionParams {
  language: string
  projectRoot: string
  filePath: string
  content: string
  line: number
  column: number
}

export interface LspCompletionItem {
  label: string
  // Raw LSP CompletionItemKind (1–25); the renderer maps it to Monaco's enum.
  kind?: number
  detail?: string
  // Already flattened to a markdown/plaintext string by the manager.
  documentation?: string
  insertText: string
  isSnippet?: boolean
  sortText?: string
  filterText?: string
}

export interface LspHoverResult {
  // One or more markdown blocks, ready to drop into a Monaco hover.
  contents: string[]
}
