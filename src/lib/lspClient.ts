import { useFileStore } from '@/stores/fileStore'
import { LSP_SERVER_IDS, useLspSettingsStore, type LspServerId } from '@/stores/lspSettingsStore'
import { pathForModel } from './lspModelRegistry'
import { openFileAtLocation } from './openFileLocation'

const SUPPORTED_LANGUAGES: Record<string, LspServerId> = {
  typescript: 'typescript',
  javascript: 'typescript',
  python: 'python',
  go: 'go',
  rust: 'rust',
}

let registered = false

// Registers Monaco's go-to-definition provider for the four languages vIDE
// can back with a real language server. The Cmd+click gesture itself is
// Monaco/VS Code's built-in behavior — it appears automatically for any
// language with a DefinitionProvider registered, nothing custom needed for
// that part.
export function registerLspDefinitionProvider(monaco: typeof import('monaco-editor')): void {
  if (registered) return
  registered = true

  // Sync this window's enabled-language set into the main process once at
  // startup — LanguageServerManager (electron/lsp/manager.ts) keeps that
  // state per-window and only learns about it via lsp:setEnabled.
  const enabled = useLspSettingsStore.getState().enabled
  for (const id of LSP_SERVER_IDS) window.api.lspSetEnabled(id, enabled[id])

  monaco.languages.registerDefinitionProvider(Object.keys(SUPPORTED_LANGUAGES), {
    async provideDefinition(model, position) {
      const language = model.getLanguageId()
      const serverId = SUPPORTED_LANGUAGES[language]
      if (!serverId || !useLspSettingsStore.getState().enabled[serverId]) return []

      const projectRoot = useFileStore.getState().projectRoot
      const filePath = pathForModel(model)
      if (!projectRoot || !filePath) return []

      const results = await window.api.lspGetDefinition({
        language,
        projectRoot,
        filePath,
        content: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      })
      if (results.length === 0) return []

      const sameFile = results.filter((r) => r.path === filePath)
      const otherFile = results.find((r) => r.path !== filePath)

      // Monaco's standalone editor (as opposed to the full VS Code
      // workbench) doesn't reliably jump across models on its own — rather
      // than fight that, hand cross-file jumps to vIDE's own tab-opening
      // machinery (the same one Search-in-files uses) and tell Monaco
      // there's nothing more for it to do.
      if (otherFile && sameFile.length === 0) {
        await openFileAtLocation(otherFile.path, otherFile.line, otherFile.col)
        return []
      }

      return sameFile.map((r) => ({
        uri: model.uri,
        range: { startLineNumber: r.line, startColumn: r.col, endLineNumber: r.line, endColumn: r.col },
      }))
    },
  })
}
