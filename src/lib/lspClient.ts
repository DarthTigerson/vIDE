import type { editor, languages, Position } from 'monaco-editor'
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
  yaml: 'yaml',
  json: 'json',
}

let registered = false

// The common preamble for every provider below: the file is only served by a
// language server when that language's server is toggled on, and we need both
// a project root and a real on-disk path to ask about. Returns null to mean
// "this provider has nothing to contribute here".
function requestBase(model: editor.ITextModel, position: Position) {
  const language = model.getLanguageId()
  const serverId = SUPPORTED_LANGUAGES[language]
  if (!serverId || !useLspSettingsStore.getState().enabled[serverId]) return null

  const projectRoot = useFileStore.getState().projectRoot
  const filePath = pathForModel(model)
  if (!projectRoot || !filePath) return null

  return {
    language,
    projectRoot,
    filePath,
    content: model.getValue(),
    line: position.lineNumber,
    column: position.column,
  }
}

// Registers go-to-definition, completion and hover against Monaco for every
// language vIDE can back with a real language server. Each provider is a
// no-op unless that language's server is enabled in Settings > Editor, so a
// language the user hasn't turned on costs nothing. Completion and hover have
// an extra global switch each (the footer's Display panel), letting the user
// mute those two everywhere without stopping any server. The Cmd+click gesture
// for definition is Monaco/VS Code's own built-in behavior — registering a
// DefinitionProvider is all it needs.
export function registerLspProviders(monaco: typeof import('monaco-editor')): void {
  if (registered) return
  registered = true

  // Sync this window's enabled-language set into the main process once at
  // startup — LanguageServerManager (electron/lsp/manager.ts) keeps that
  // state per-window and only learns about it via lsp:setEnabled.
  const enabled = useLspSettingsStore.getState().enabled
  for (const id of LSP_SERVER_IDS) window.api.lspSetEnabled(id, enabled[id])

  const languages = Object.keys(SUPPORTED_LANGUAGES)

  monaco.languages.registerDefinitionProvider(languages, {
    async provideDefinition(model, position) {
      const base = requestBase(model, position)
      if (!base) return []

      const results = await window.api.lspGetDefinition(base)
      if (results.length === 0) return []

      const sameFile = results.filter((r) => r.path === base.filePath)
      const otherFile = results.find((r) => r.path !== base.filePath)

      // Monaco's standalone editor (as opposed to the full VS Code
      // workbench) doesn't reliably jump across models on its own — rather
      // than fight that, hand cross-file jumps to vIDE's own tab-opening
      // machinery (the same one Search-in-files uses) and tell Monaco
      // there's nothing more for it to do.
      if (otherFile && sameFile.length === 0) {
        await openFileAtLocation(otherFile.path, otherFile.line, otherFile.col, '', { stayInActivePane: true })
        return []
      }

      return sameFile.map((r) => ({
        uri: model.uri,
        range: { startLineNumber: r.line, startColumn: r.col, endLineNumber: r.line, endColumn: r.col },
      }))
    },
  })

  monaco.languages.registerHoverProvider(languages, {
    async provideHover(model, position) {
      if (!useLspSettingsStore.getState().hoverEnabled) return null
      const base = requestBase(model, position)
      if (!base) return null

      const hover = await window.api.lspGetHover(base)
      if (!hover || hover.contents.length === 0) return null
      return { contents: hover.contents.map((value) => ({ value })) }
    },
  })

  monaco.languages.registerCompletionItemProvider(languages, {
    // Punctuation that should re-trigger the server mid-token — member access,
    // YAML/JSON keys, paths, decorators, JSX. Identifier typing already
    // triggers Monaco's default completion request on its own.
    triggerCharacters: ['.', ':', '-', '/', '"', '@', '<'],
    async provideCompletionItems(model, position) {
      if (!useLspSettingsStore.getState().completionEnabled) return { suggestions: [] }
      const base = requestBase(model, position)
      if (!base) return { suggestions: [] }

      const items = await window.api.lspGetCompletion(base)
      // Replace the word being typed, so accepting a suggestion overwrites the
      // partial token rather than appending to it.
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      return {
        suggestions: items.map((item): languages.CompletionItem => ({
          label: item.label,
          kind: toMonacoKind(monaco, item.kind),
          detail: item.detail,
          documentation: item.documentation ? { value: item.documentation } : undefined,
          insertText: item.insertText,
          insertTextRules: item.isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          sortText: item.sortText,
          filterText: item.filterText,
          range,
        })),
      }
    },
  })
}

// LSP CompletionItemKind (1–25, stable per spec) → Monaco's own enum, which
// uses the same names but different numeric values.
function toMonacoKind(
  monaco: typeof import('monaco-editor'),
  lspKind?: number
): languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind
  const byLspKind: Record<number, languages.CompletionItemKind> = {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field,
    6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
    11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet,
    16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
    21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter,
  }
  return (lspKind !== undefined ? byLspKind[lspKind] : undefined) ?? K.Text
}
