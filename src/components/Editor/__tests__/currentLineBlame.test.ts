import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { GitBlameLine } from '@/types/index'

vi.mock('@/lib/gitBlame', () => ({
  getFileBlame: vi.fn(),
}))

import { getFileBlame } from '@/lib/gitBlame'
import { attachCurrentLineBlame } from '../currentLineBlame'

function blameLine(overrides: Partial<GitBlameLine> = {}): GitBlameLine {
  return {
    line: 1,
    hash: 'abcdef1234567890abcdef1234567890abcdef12',
    author: 'Ada Lovelace',
    authorTime: 1700000000,
    summary: 'Initial commit',
    ...overrides,
  }
}

// Minimal stand-in for Monaco.editor.IStandaloneCodeEditor + the monaco
// namespace - only the surface attachCurrentLineBlame actually touches.
// Blame renders via a content widget (see currentLineBlame.ts), so the fake
// editor tracks the single widget it adds/removes rather than decorations.
type FakeSelection = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  positionLineNumber: number
}

function makeFakeEditor(initialContent: string) {
  let content = initialContent
  let selection: FakeSelection = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1, positionLineNumber: 1 }
  const contentListeners: Array<() => void> = []
  const selectionListeners: Array<(e: { selection: typeof selection }) => void> = []
  let widget: { getDomNode: () => { textContent: string | null }; getPosition: () => { position: { lineNumber: number; column: number } } | null } | null = null

  const editor = {
    getModel: () => ({
      getValue: () => content,
      getLineMaxColumn: (_line: number) => 999,
    }),
    onDidChangeModelContent: (cb: () => void) => {
      contentListeners.push(cb)
      return { dispose: () => {} }
    },
    onDidChangeCursorSelection: (cb: (e: { selection: typeof selection }) => void) => {
      selectionListeners.push(cb)
      return { dispose: () => {} }
    },
    getSelection: () => selection,
    addContentWidget: (w: typeof widget) => { widget = w },
    removeContentWidget: (w: typeof widget) => { if (widget === w) widget = null },
    layoutContentWidget: (_w: typeof widget) => {},
  }

  const monaco = {
    editor: { ContentWidgetPositionPreference: { EXACT: 0 } },
  }

  return {
    editor,
    monaco,
    // Reads what's currently shown, the same way Monaco itself would: via
    // the widget's own getPosition()/getDomNode(), not internal state.
    currentAnnotation(): { line: number; text: string } | null {
      if (!widget) return null
      const pos = widget.getPosition()
      if (!pos) return null
      return { line: pos.position.lineNumber, text: widget.getDomNode().textContent ?? '' }
    },
    // Simulates the user clicking/arrow-keying to a new line with no edit.
    moveCursorTo(line: number) {
      selection = { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1, positionLineNumber: line }
      for (const cb of selectionListeners) cb({ selection })
    },
    // Simulates typing (e.g. Enter): content changes, then Monaco fires the
    // cursor-selection event for the moved caret.
    editContentAndMoveCursorTo(newContent: string, line: number) {
      content = newContent
      for (const cb of contentListeners) cb()
      selection = { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1, positionLineNumber: line }
      for (const cb of selectionListeners) cb({ selection })
    },
    // Simulates a triple-click / "select line" drag: Monaco reports this as
    // spanning into the *next* line at column 1, even though nothing on
    // that next line is actually selected.
    selectWholeLine(line: number) {
      selection = {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line + 1,
        endColumn: 1,
        positionLineNumber: line + 1,
      }
      for (const cb of selectionListeners) cb({ selection })
    },
  }
}

describe('attachCurrentLineBlame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(global as any).window = { api: { gitFileAtHead: vi.fn() } }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders blame for a line reached by a plain click, with no intervening content edit', async () => {
    const headContent = 'line one\nline two\nline three\n'
    const fake = makeFakeEditor(headContent)
    ;(getFileBlame as any).mockResolvedValue({
      headCommit: 'deadbeef',
      lines: [
        blameLine({ line: 1, author: 'Ada Lovelace' }),
        blameLine({ line: 2, author: 'Grace Hopper' }),
        blameLine({ line: 3, author: 'Margaret Hamilton' }),
      ],
    })
    ;(window.api.gitFileAtHead as any).mockResolvedValue(headContent)

    attachCurrentLineBlame(fake.editor as any, fake.monaco as any, { repoRoot: '/repo', relPath: 'f.txt' })

    // Let the initial loadAll() promise chain resolve.
    await vi.runAllTimersAsync()

    fake.moveCursorTo(2)

    const shown = fake.currentAnnotation()
    expect(shown).not.toBeNull()
    expect(shown!.line).toBe(2)
    expect(shown!.text).toContain('Grace Hopper')
  })

  it('keeps rendering correctly across several consecutive clicks', async () => {
    const headContent = 'line one\nline two\nline three\n'
    const fake = makeFakeEditor(headContent)
    ;(getFileBlame as any).mockResolvedValue({
      headCommit: 'deadbeef',
      lines: [
        blameLine({ line: 1, author: 'Ada Lovelace' }),
        blameLine({ line: 2, author: 'Grace Hopper' }),
        blameLine({ line: 3, author: 'Margaret Hamilton' }),
      ],
    })
    ;(window.api.gitFileAtHead as any).mockResolvedValue(headContent)

    attachCurrentLineBlame(fake.editor as any, fake.monaco as any, { repoRoot: '/repo', relPath: 'f.txt' })
    await vi.runAllTimersAsync()

    for (const [line, author] of [[3, 'Margaret Hamilton'], [1, 'Ada Lovelace'], [2, 'Grace Hopper']] as const) {
      fake.moveCursorTo(line)
      const shown = fake.currentAnnotation()
      expect(shown!.line).toBe(line)
      expect(shown!.text).toContain(author)
    }
  })

  it('still shows blame for the source line when the selection spans into the next line at column 1 (triple-click "select line")', async () => {
    const headContent = 'line one\nline two\nline three\n'
    const fake = makeFakeEditor(headContent)
    ;(getFileBlame as any).mockResolvedValue({
      headCommit: 'deadbeef',
      lines: [
        blameLine({ line: 1, author: 'Ada Lovelace' }),
        blameLine({ line: 2, author: 'Grace Hopper' }),
        blameLine({ line: 3, author: 'Margaret Hamilton' }),
      ],
    })
    ;(window.api.gitFileAtHead as any).mockResolvedValue(headContent)

    attachCurrentLineBlame(fake.editor as any, fake.monaco as any, { repoRoot: '/repo', relPath: 'f.txt' })
    await vi.runAllTimersAsync()

    fake.selectWholeLine(2)

    const shown = fake.currentAnnotation()
    expect(shown!.line).toBe(2)
    expect(shown!.text).toContain('Grace Hopper')
  })
})
