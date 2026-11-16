import type { LanguageServerEntry } from './catalog'

// A catalog entry id (e.g. 'typescript', 'go'). Any id the Store lists.
export type LspServerId = string

export interface DetectResult {
  found: boolean
  path?: string
  version?: string
}

export interface SpawnSpec {
  command: string
  args: string[]
}

// An installed server as the renderer sees it: its catalog snapshot plus
// whether the binary is (still) on this machine.
export type InstalledServerInfo = DetectResult & { entry: LanguageServerEntry }

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
