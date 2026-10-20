import { getCompletionContext, type PositionLike, type TextModelLike } from './autocompleteContext'
import { isAutocompleteEffectivelyEnabled } from './autocompleteEffectiveState'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { pickNeighborSnippets, type NeighborChunk } from './autocompleteNeighbors'

// A local model answers in a few hundred ms, so ghost text can follow a short
// pause in typing rather than the long one the Claude CLI needed.
const DEBOUNCE_MS = 150

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface CancellationTokenLike {
  isCancellationRequested: boolean
}

export interface InlineCompletionItem {
  insertText: string
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
}

type LanguageAwareModel = TextModelLike & { getLanguageId(): string }

// The lines just before the cursor, which the open-tab snippets are matched against.
const NEIGHBOR_MATCH_LINES = 20

// The file being typed in (the focused pane's tab, for the main process's
// project-graph lookup) and the best-matching snippets of the other open
// files. Tab content is what the editor holds, unsaved edits included.
// Only with Settings › Autocomplete › Project context on.
function editorContext(prefix: string): { filePath?: string; extra: NeighborChunk[] } {
  if (!useAutocompleteSettingsStore.getState().projectContext) return { extra: [] }
  const { tabs, activeTabPath } = useEditorStore.getState()
  const root = useFileStore.getState().projectRoot
  const filePath = activeTabPath?.startsWith('/') ? activeTabPath : undefined
  const others = tabs
    .filter((t) => t.path !== activeTabPath && t.path.startsWith('/') && t.content)
    .map((t) => ({ filename: root && t.path.startsWith(root + '/') ? t.path.slice(root.length + 1) : t.path, text: t.content }))
  const extra = pickNeighborSnippets(prefix.split('\n').slice(-NEIGHBOR_MATCH_LINES).join('\n'), others)
  return { ...(filePath ? { filePath } : {}), extra }
}

// The last suggestion shown, so typing it out character by character keeps
// showing the rest at once instead of a fresh (and possibly different) request.
let lastShown: { filePath?: string; prefixTail: string; text: string } | null = null
const PREFIX_TAIL_CHARS = 200

function continueTyped(filePath: string | undefined, prefix: string): string | null {
  if (!lastShown || lastShown.filePath !== filePath) return null
  for (let n = 1; n < lastShown.text.length; n++) {
    const typed = lastShown.text.slice(0, n)
    if (prefix.endsWith(typed) && prefix.slice(0, -n).endsWith(lastShown.prefixTail)) return lastShown.text.slice(n)
  }
  return null
}

function at(position: PositionLike, insertText: string): InlineCompletionItem[] {
  return [{
    insertText,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    },
  }]
}

export async function provideInlineCompletion(
  model: LanguageAwareModel,
  position: PositionLike,
  token: CancellationTokenLike
): Promise<InlineCompletionItem[]> {
  if (!isAutocompleteEffectivelyEnabled()) return []

  const filePathNow = useEditorStore.getState().activeTabPath ?? undefined
  const typedThrough = continueTyped(filePathNow, getCompletionContext(model, position).prefix)
  if (typedThrough) return at(position, typedThrough)

  await sleep(DEBOUNCE_MS)
  if (token.isCancellationRequested || !isAutocompleteEffectivelyEnabled()) return []

  const { prefix, suffix } = getCompletionContext(model, position)
  const { filePath, extra } = editorContext(prefix)

  useAutocompleteRuntimeStore.getState().setBusy(true)
  let text: string | null
  try {
    text = await window.api.autocompleteComplete({ prefix, suffix, ...(filePath ? { filePath } : {}), ...(extra.length ? { extra } : {}) })
  } catch {
    return []
  } finally {
    useAutocompleteRuntimeStore.getState().setBusy(false)
  }

  if (!text || token.isCancellationRequested) return []
  lastShown = { filePath, prefixTail: prefix.slice(-PREFIX_TAIL_CHARS), text }
  return at(position, text)
}

let registered = false

export function registerAutocompleteProvider(monaco: typeof import('monaco-editor')): void {
  if (registered) return
  registered = true

  monaco.languages.registerInlineCompletionsProvider('*', {
    provideInlineCompletions: async (model, position, _context, token) => ({
      items: await provideInlineCompletion(model as unknown as LanguageAwareModel, position, token),
    }),
    disposeInlineCompletions: () => {},
  })
}
