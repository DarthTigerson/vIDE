import { goServer } from './go'
import { jsonServer } from './json'
import { pythonServer } from './python'
import { rustServer } from './rust'
import { typescriptServer } from './typescript'
import { yamlServer } from './yaml'
import type { LspServerId, LspServerModule } from '../types'

export const LSP_SERVERS: Record<LspServerId, LspServerModule> = {
  typescript: typescriptServer,
  python: pythonServer,
  go: goServer,
  rust: rustServer,
  yaml: yamlServer,
  json: jsonServer,
}

export function serverForMonacoLanguage(languageId: string): LspServerModule | null {
  return Object.values(LSP_SERVERS).find((s) => s.monacoLanguageIds.includes(languageId)) ?? null
}
