import { createReplacer, findMatches, DEFAULT_MATCH_LIMIT, type FindMatch, type FindOptions } from './findInText'

// Drives an editor for the in-editor find box. It only needs this small
// structural slice of Monaco's editor API, which keeps the logic unit-testable
// (Monaco cannot run under jsdom); the real editor is checked against it by
// tsc where the box is wired up.

export interface FindRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

export interface FindDecoration {
  range: FindRange
  options: {
    inlineClassName?: string
    overviewRuler?: { color: string; position: number }
  }
}

export interface FindEditor {
  getModel(): {
    getValue(): string
    getLineContent(lineNumber: number): string
    getLineCount(): number
  } | null
  getPosition(): { lineNumber: number; column: number } | null
  getSelection(): (FindRange & { isEmpty(): boolean }) | null
  setSelection(range: FindRange): void
  revealRangeInCenterIfOutsideViewport(range: FindRange): void
  executeEdits(source: string, edits: Array<{ range: FindRange; text: string }>): unknown
  pushUndoStop(): unknown
  createDecorationsCollection(decorations?: FindDecoration[]): { set(decorations: FindDecoration[]): unknown; clear(): void }
  onDidChangeModelContent(listener: () => void): { dispose(): void }
  focus(): void
}

export interface FindSnapshot {
  count: number
  // 1-based index of the current match, 0 when there is none.
  current: number
  truncated: boolean
  error?: string
}

interface ControllerSettings {
  // Called after the matches were recomputed because the text changed.
  onChange?: (snapshot: FindSnapshot) => void
  // Colour of the match marks in the scrollbar.
  matchColor?: string
  matchLimit?: number
}

const OVERVIEW_RULER_RIGHT = 4 // monaco.editor.OverviewRulerLane.Right
const CONTENT_DEBOUNCE_MS = 60
const EDIT_SOURCE = 'vide-find-replace'

function rangeOf(match: FindMatch, length = match.length): FindRange {
  return { startLineNumber: match.line, startColumn: match.col, endLineNumber: match.line, endColumn: match.col + length }
}

// Where the caret ends up after `text` is inserted at (line, col).
function endOfInsert(line: number, col: number, text: string): { line: number; col: number } {
  const parts = text.split('\n')
  if (parts.length === 1) return { line, col: col + text.length }
  return { line: line + parts.length - 1, col: parts[parts.length - 1].length + 1 }
}

export class EditorFindController {
  private matches: FindMatch[] = []
  private currentIndex = -1
  private truncated = false
  private error: string | undefined
  private options: FindOptions | null = null
  private applying = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly decorations: ReturnType<FindEditor['createDecorationsCollection']>
  private readonly listener: { dispose(): void }
  private readonly matchLimit: number

  constructor(private readonly editor: FindEditor, private readonly settings: ControllerSettings = {}) {
    this.matchLimit = settings.matchLimit ?? DEFAULT_MATCH_LIMIT
    this.decorations = editor.createDecorationsCollection()
    this.listener = editor.onDidChangeModelContent(() => this.onContentChanged())
  }

  getSnapshot(): FindSnapshot {
    return { count: this.matches.length, current: this.currentIndex + 1, truncated: this.truncated, error: this.error }
  }

  // Recomputes the matches for `options`. With `select`, also selects and
  // reveals the current match (used while typing the query).
  refresh(options: FindOptions, { select = false }: { select?: boolean } = {}): FindSnapshot {
    this.options = options
    const result = findMatches(this.text(), options, this.matchLimit)
    this.matches = result.matches
    this.truncated = result.truncated
    this.error = result.error
    this.currentIndex = this.pickCurrent()
    if (select && this.currentIndex >= 0) this.select(this.currentIndex)
    else this.decorate()
    return this.getSnapshot()
  }

  next(): FindSnapshot { return this.step(1) }
  prev(): FindSnapshot { return this.step(-1) }

  // Replaces the current match and moves to the next one. If the current match
  // is not selected yet, it is only selected first (nothing changes).
  replaceCurrent(options: FindOptions, replacement: string): FindSnapshot {
    this.refresh(options)
    if (this.currentIndex < 0 || this.error) return this.getSnapshot()
    if (!this.isSelected(this.currentIndex)) return this.select(this.currentIndex)

    let replacer: ReturnType<typeof createReplacer>
    try {
      replacer = createReplacer({ ...options, replacement })
    } catch {
      return this.getSnapshot()
    }
    const match = this.matches[this.currentIndex]
    const model = this.editor.getModel()
    const found = model ? replacer(model.getLineContent(match.line), match.col) : null
    if (!found) return this.refresh(options)

    this.apply([{ range: rangeOf(match, found.length), text: found.text }])

    // Continue after what was just inserted, so a replacement that itself
    // contains the search text is never matched again.
    const after = endOfInsert(match.line, match.col, found.text)
    this.refresh(options)
    const next = this.matches.findIndex((m) => m.line > after.line || (m.line === after.line && m.col >= after.col))
    const target = next >= 0 ? next : (this.matches.length > 0 ? 0 : -1)
    if (target >= 0) return this.select(target)
    return this.getSnapshot()
  }

  // Replaces every match in one undoable step. Returns how many were changed.
  replaceAll(options: FindOptions, replacement: string): number {
    const model = this.editor.getModel()
    if (!model || !options.query) return 0

    let replacer: ReturnType<typeof createReplacer>
    try {
      replacer = createReplacer({ ...options, replacement })
    } catch {
      return 0
    }
    // Every match, not just the ones counted for display, and every replacement
    // computed against the original text.
    const all = findMatches(model.getValue(), options, Infinity)
    if (all.error) return 0
    const edits: Array<{ range: FindRange; text: string }> = []
    for (const match of all.matches) {
      const found = replacer(model.getLineContent(match.line), match.col)
      if (found) edits.push({ range: rangeOf(match, found.length), text: found.text })
    }
    if (edits.length === 0) return 0

    this.apply(edits)
    this.refresh(options)
    return edits.length
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.listener.dispose()
    this.decorations.clear()
  }

  private text(): string {
    return this.editor.getModel()?.getValue() ?? ''
  }

  // Our own edits are bracketed by undo stops (so Cmd+Z undoes exactly one
  // replace / replace-all) and must not trigger the outside-edit recompute.
  private apply(edits: Array<{ range: FindRange; text: string }>): void {
    this.applying = true
    try {
      this.editor.pushUndoStop()
      this.editor.executeEdits(EDIT_SOURCE, edits)
      this.editor.pushUndoStop()
    } finally {
      this.applying = false
    }
  }

  private step(delta: 1 | -1): FindSnapshot {
    if (this.matches.length === 0) return this.getSnapshot()
    if (this.currentIndex < 0) this.currentIndex = this.pickCurrent()
    // Nothing selected yet: land on the current match rather than skipping it.
    if (!this.isSelected(this.currentIndex)) return this.select(this.currentIndex)
    const n = this.matches.length
    return this.select((this.currentIndex + delta + n) % n)
  }

  private isSelected(index: number): boolean {
    const selection = this.editor.getSelection()
    const match = this.matches[index]
    if (!selection || !match) return false
    return selection.startLineNumber === match.line && selection.startColumn === match.col &&
      selection.endLineNumber === match.line && selection.endColumn === match.col + match.length
  }

  // The match that is already selected, else the first one at or after the
  // cursor (wrapping to the first).
  private pickCurrent(): number {
    if (this.matches.length === 0) return -1
    const selection = this.editor.getSelection()
    const selected = selection && !selection.isEmpty()
      ? this.matches.findIndex((_, i) => this.isSelected(i))
      : -1
    if (selected >= 0) return selected

    const from = selection && !selection.isEmpty()
      ? { line: selection.startLineNumber, col: selection.startColumn }
      : (() => { const p = this.editor.getPosition(); return { line: p?.lineNumber ?? 1, col: p?.column ?? 1 } })()
    const after = this.matches.findIndex((m) => m.line > from.line || (m.line === from.line && m.col >= from.col))
    return after >= 0 ? after : 0
  }

  private select(index: number): FindSnapshot {
    this.currentIndex = index
    const range = rangeOf(this.matches[index])
    this.editor.setSelection(range)
    this.editor.revealRangeInCenterIfOutsideViewport(range)
    this.decorate()
    return this.getSnapshot()
  }

  private decorate(): void {
    const color = this.settings.matchColor ?? '#d8a94c'
    const decorations: FindDecoration[] = this.matches.map((m) => ({
      range: rangeOf(m),
      options: { inlineClassName: 'find-match', overviewRuler: { color, position: OVERVIEW_RULER_RIGHT } },
    }))
    const current = this.matches[this.currentIndex]
    if (current) decorations.push({ range: rangeOf(current), options: { inlineClassName: 'find-match-current' } })
    this.decorations.set(decorations)
  }

  private onContentChanged(): void {
    if (this.applying || !this.options) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.options) return
      this.settings.onChange?.(this.refresh(this.options))
    }, CONTENT_DEBOUNCE_MS)
  }
}
