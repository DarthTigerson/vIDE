import { vi } from 'vitest'
import type { FindEditor, FindRange } from '../editorFindController'

// A tiny in-memory editor: enough of Monaco's surface for the controller.
export function fakeEditor(initial: string) {
  let content = initial
  let position = { lineNumber: 1, column: 1 }
  let selection: FindRange | null = null
  const listeners = new Set<() => void>()
  const calls = { executeEdits: [] as Array<{ source: string | null | undefined; edits: Array<{ range: FindRange; text: string }> }>, undoStops: 0, order: [] as string[] }
  let decorations: Array<{ range: FindRange; options: Record<string, unknown> }> = []
  let cleared = 0

  const offsetOf = (line: number, col: number) => {
    const lines = content.split('\n')
    let off = 0
    for (let i = 0; i < line - 1; i++) off += lines[i].length + 1
    return off + col - 1
  }

  const editor: FindEditor = {
    getModel: () => ({
      getValue: () => content,
      getLineContent: (n: number) => content.split('\n')[n - 1] ?? '',
      getLineCount: () => content.split('\n').length,
    }),
    getPosition: () => position,
    getSelection: () => selection && { ...selection, isEmpty: () => selection!.startLineNumber === selection!.endLineNumber && selection!.startColumn === selection!.endColumn },
    setSelection: (r: FindRange) => { selection = r; position = { lineNumber: r.endLineNumber, column: r.endColumn } },
    revealRangeInCenterIfOutsideViewport: vi.fn(),
    executeEdits: (source, edits) => {
      calls.executeEdits.push({ source, edits })
      calls.order.push('edit')
      const sorted = [...edits].sort((a, b) => offsetOf(b.range.startLineNumber, b.range.startColumn) - offsetOf(a.range.startLineNumber, a.range.startColumn))
      for (const e of sorted) {
        const s = offsetOf(e.range.startLineNumber, e.range.startColumn)
        const en = offsetOf(e.range.endLineNumber, e.range.endColumn)
        content = content.slice(0, s) + e.text + content.slice(en)
      }
      listeners.forEach((l) => l())
      return true
    },
    pushUndoStop: () => { calls.undoStops++; calls.order.push('stop') },
    createDecorationsCollection: () => ({
      set: (d) => { decorations = d as typeof decorations },
      clear: () => { decorations = []; cleared++ },
    }),
    onDidChangeModelContent: (cb: () => void) => { listeners.add(cb); return { dispose: () => { listeners.delete(cb) } } },
    focus: vi.fn(),
  }
  return {
    editor,
    calls,
    text: () => content,
    selection: () => selection,
    setPosition: (line: number, column: number) => { position = { lineNumber: line, column }; selection = null },
    type: (next: string) => { content = next; listeners.forEach((l) => l()) },
    decorations: () => decorations,
    cleared: () => cleared,
    listenerCount: () => listeners.size,
  }
}

export const sel = (line: number, col: number, len = 4): FindRange => ({ startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col + len })

