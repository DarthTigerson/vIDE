import type { editor, languages, Position } from 'monaco-editor'
import { useFileStore } from '@/stores/fileStore'
import { isServerEnabled, useLspSettingsStore, type LspServerId } from '@/stores/lspSettingsStore'
import { subscribeLspEvents, useLspStatusStore } from '@/stores/lspStatusStore'
import { pathForModel } from './lspModelRegistry'
import { openFileAtLocation } from './openFileLocation'

// Monaco language id → installed server id, rebuilt from the Store installs
// (lspStatusStore) whenever they change.
let serverByLanguage = new Map<string, LspServerId>()
const registeredLanguages = new Set<string>()
let started = false

// The common preamble for every provider below: the file is only served by a
// language server when one is installed for its language and switched on,
// and we need both a project root and a real on-disk path to ask about.
// Returns null to mean "this provider has nothing to contribute here".
function requestBase(model: editor.ITextModel, position: Position) {
  const language = model.getLanguageId()
  const serverId = serverByLanguage.get(language)
  if (!serverId) return null
  const enabled = useLspSettingsStore.getState().enabled[serverId] ?? isServerEnabled(serverId)
  if (!enabled) return null

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

// Go-to-definition, completion and hover against Monaco for every language an
// installed Store language server covers. Providers are registered per
// language the first time a server for it is installed (Monaco has no way to
// unregister a selector cleanly, and a provider whose server is gone simply
// returns nothing). The Cmd+click gesture for definition is Monaco/VS Code's
// own built-in behavior — registering a DefinitionProvider is all it needs.
export function registerLspProviders(monaco: typeof import('monaco-editor')): void {
  if (started) return
  started = true
  subscribeLspEvents()
  const apply = () => {
    const installed = useLspStatusStore.getState().installed
    serverByLanguage = new Map(installed.flatMap((i) => i.entry.languages.map((l) => [l, i.entry.id] as const)))
    // Main keeps the on/off set per window and only learns it via lsp:setEnabled.
    for (const i of installed) window.api.lspSetEnabled(i.entry.id, isServerEnabled(i.entry.id))
    const fresh = [...serverByLanguage.keys()].filter((l) => !registeredLanguages.has(l))
    fresh.forEach((l) => registeredLanguages.add(l))
    if (fresh.length > 0) registerFor(monaco, fresh)
  }
  useLspStatusStore.subscribe((state, prev) => { if (state.installed !== prev.installed) apply() })
  void useLspStatusStore.getState().refresh()
}

function registerFor(monaco: typeof import('monaco-editor'), languages: string[]): void {
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
