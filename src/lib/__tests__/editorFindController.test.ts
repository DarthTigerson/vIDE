import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EditorFindController, type FindEditor, type FindRange, type FindSnapshot } from '../editorFindController'
import type { FindOptions } from '../findInText'

const opts: FindOptions = { query: 'path', caseSensitive: false, wholeWord: false, regex: false }

// A tiny in-memory editor: enough of Monaco's surface for the controller.
function fakeEditor(initial: string) {
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

const sel = (line: number, col: number, len = 4): FindRange => ({ startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col + len })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('EditorFindController — matches and the current match', () => {
  it('counts matches and marks the first one at or after the cursor as current', () => {
    const f = fakeEditor('path\nx path\npath')
    f.setPosition(2, 1)
    const c = new EditorFindController(f.editor)
    expect(c.refresh(opts)).toEqual({ count: 3, current: 2, truncated: false })
  })

  it('wraps to the first match when the cursor is past the last one', () => {
    const f = fakeEditor('path\nx path\nend')
    f.setPosition(3, 1)
    expect(new EditorFindController(f.editor).refresh(opts).current).toBe(1)
  })

  it('reports no current match when there are none', () => {
    const f = fakeEditor('nothing here')
    expect(new EditorFindController(f.editor).refresh(opts)).toEqual({ count: 0, current: 0, truncated: false })
  })

  it('selects and reveals the current match when asked to (as you type)', () => {
    const f = fakeEditor('x\nx path')
    new EditorFindController(f.editor).refresh(opts, { select: true })
    expect(f.selection()).toEqual(sel(2, 3))
    expect(f.editor.revealRangeInCenterIfOutsideViewport).toHaveBeenCalledWith(sel(2, 3))
  })

  it('does not touch the selection on a plain refresh', () => {
    const f = fakeEditor('path')
    new EditorFindController(f.editor).refresh(opts)
    expect(f.selection()).toBeNull()
  })

  it('keeps the current match when refreshing while it is selected', () => {
    const f = fakeEditor('path\npath\npath')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.next()
    expect(c.refresh(opts).current).toBe(2)
  })

  it('surfaces an invalid regex and the truncation flag', () => {
    const f = fakeEditor('path')
    const c = new EditorFindController(f.editor)
    const bad = c.refresh({ ...opts, query: '(oops', regex: true })
    expect(bad.count).toBe(0)
    expect(bad.error).toBeTruthy()
    expect(c.refresh(opts).error).toBeUndefined()
  })
})

describe('EditorFindController — next / previous', () => {
  it('steps forward and back, wrapping at both ends, selecting each match', () => {
    const f = fakeEditor('path\nx path\npath')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    expect(c.getSnapshot().current).toBe(1)
    expect(c.next().current).toBe(2)
    expect(f.selection()).toEqual(sel(2, 3))
    expect(c.next().current).toBe(3)
    expect(c.next().current).toBe(1)
    expect(f.selection()).toEqual(sel(1, 1))
    expect(c.prev().current).toBe(3)
    expect(c.prev().current).toBe(2)
  })

  it('does nothing when there are no matches', () => {
    const f = fakeEditor('nothing')
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    expect(c.next()).toMatchObject({ count: 0, current: 0 })
    expect(f.selection()).toBeNull()
  })

  it('selects the current match first, instead of skipping it, when it was not selected yet', () => {
    const f = fakeEditor('path\nx path\npath')
    f.setPosition(2, 1)
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    expect(c.next().current).toBe(2)
    expect(f.selection()).toEqual(sel(2, 3))
    expect(c.next().current).toBe(3)
  })

  it('replace also selects the current match first when it was not selected yet, without replacing', () => {
    const f = fakeEditor('a path b')
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    c.replaceCurrent(opts, 'x')
    expect(f.text()).toBe('a path b')
    expect(f.selection()).toEqual(sel(1, 3))
    c.replaceCurrent(opts, 'x')
    expect(f.text()).toBe('a x b')
  })
})

describe('EditorFindController — highlighting', () => {
  it('decorates every match, and the current one on top', () => {
    const f = fakeEditor('path\nx path')
    const c = new EditorFindController(f.editor, { matchColor: '#abc' })
    c.refresh(opts)
    const d = f.decorations()
    expect(d.filter((x) => x.options.inlineClassName === 'find-match')).toHaveLength(2)
    expect(d.filter((x) => x.options.inlineClassName === 'find-match-current')).toHaveLength(1)
    expect(d.find((x) => x.options.inlineClassName === 'find-match')?.options.overviewRuler).toMatchObject({ color: '#abc' })
  })

  it('clears highlights and stops listening when disposed', () => {
    const f = fakeEditor('path')
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    c.dispose()
    expect(f.decorations()).toEqual([])
    expect(f.listenerCount()).toBe(0)
  })
})

describe('EditorFindController — replace one', () => {
  it('replaces the current match and jumps to the next', () => {
    const f = fakeEditor('path a\npath b\npath c')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    const snap = c.replaceCurrent(opts, 'filePath')
    expect(f.text()).toBe('filePath a\npath b\npath c')
    // "filePath" itself contains "path", so it is a match too (3 in total) —
    // but the jump skips past what was just inserted, to the next original one.
    expect(snap).toMatchObject({ count: 3, current: 2 })
    expect(f.selection()).toEqual(sel(2, 1))
  })

  it('brackets the edit in undo stops so Cmd+Z undoes just that replacement', () => {
    const f = fakeEditor('path\npath')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'x')
    expect(f.calls.order).toEqual(['stop', 'edit', 'stop'])
    expect(f.calls.executeEdits).toHaveLength(1)
    expect(f.calls.executeEdits[0].edits).toEqual([{ range: sel(1, 1), text: 'x' }])
  })

  it('wraps to the first match after replacing the last one', () => {
    const f = fakeEditor('path a\npath b')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.next()
    const snap = c.replaceCurrent(opts, 'x')
    expect(f.text()).toBe('path a\nx b')
    expect(snap).toMatchObject({ count: 1, current: 1 })
    expect(f.selection()).toEqual(sel(1, 1))
  })

  it('does not loop on a replacement that contains the search text', () => {
    const f = fakeEditor('path path')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'pathpath')
    expect(f.text()).toBe('pathpath path')
    // moved past its own output, onto the original second match
    expect(f.selection()).toEqual(sel(1, 10))
  })

  it('leaves no selection error when the last match is replaced', () => {
    const f = fakeEditor('path')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    const snap = c.replaceCurrent(opts, 'x')
    expect(f.text()).toBe('x')
    expect(snap).toMatchObject({ count: 0, current: 0 })
  })

  it('expands capture groups in regex mode', () => {
    const f = fakeEditor('get(1) get(2)')
    const c = new EditorFindController(f.editor)
    const o = { ...opts, query: 'get\\((\\d+)\\)', regex: true }
    c.refresh(o, { select: true })
    c.replaceCurrent(o, 'fetch[$1]')
    expect(f.text()).toBe('fetch[1] get(2)')
  })

  it('replaces with nothing', () => {
    const f = fakeEditor('a path b')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, '')
    expect(f.text()).toBe('a  b')
  })

  it('does nothing when there is no match, or the regex is invalid', () => {
    const f = fakeEditor('nothing')
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    c.replaceCurrent(opts, 'x')
    expect(f.calls.executeEdits).toHaveLength(0)

    const g = fakeEditor('path')
    const d = new EditorFindController(g.editor)
    const bad = { ...opts, query: '(oops', regex: true }
    d.refresh(bad)
    d.replaceCurrent(bad, 'x')
    expect(g.calls.executeEdits).toHaveLength(0)
  })

  it('handles a multi-line replacement when choosing the next match', () => {
    const f = fakeEditor('path path')
    const c = new EditorFindController(f.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'a\nb')
    expect(f.text()).toBe('a\nb path')
    expect(f.selection()).toEqual(sel(2, 3))
  })
})

describe('EditorFindController — replace all', () => {
  it('changes every match in a single undoable step and returns how many', () => {
    const f = fakeEditor('path a path\nx\npath')
    const c = new EditorFindController(f.editor)
    c.refresh(opts)
    expect(c.replaceAll(opts, 'P')).toBe(3)
    expect(f.text()).toBe('P a P\nx\nP')
    expect(f.calls.executeEdits).toHaveLength(1)
    expect(f.calls.executeEdits[0].edits).toHaveLength(3)
    expect(f.calls.order).toEqual(['stop', 'edit', 'stop'])
    expect(c.getSnapshot()).toMatchObject({ count: 0, current: 0 })
  })

  it('replaces every match even past the display limit', () => {
    const f = fakeEditor('path\n'.repeat(30))
    const c = new EditorFindController(f.editor, { matchLimit: 10 })
    c.refresh(opts)
    expect(c.getSnapshot()).toMatchObject({ count: 10, truncated: true })
    expect(c.replaceAll(opts, 'x')).toBe(30)
    expect(f.text()).toBe('x\n'.repeat(30))
  })

  it('computes every replacement against the original text (regex groups, several per line)', () => {
    const f = fakeEditor('get(1) get(22)')
    const c = new EditorFindController(f.editor)
    const o = { ...opts, query: 'get\\((\\d+)\\)', regex: true }
    c.refresh(o)
    c.replaceAll(o, 'f$1')
    expect(f.text()).toBe('f1 f22')
  })

  it('does nothing and returns 0 with no matches or an invalid regex', () => {
    const f = fakeEditor('nothing')
    const c = new EditorFindController(f.editor)
    expect(c.replaceAll(opts, 'x')).toBe(0)
    expect(c.replaceAll({ ...opts, query: '(oops', regex: true }, 'x')).toBe(0)
    expect(f.calls.executeEdits).toHaveLength(0)
  })
})

describe('EditorFindController — following edits made in the editor', () => {
  it('recomputes shortly after the text changes and reports it, without moving the selection', () => {
    const f = fakeEditor('path')
    const seen: FindSnapshot[] = []
    const c = new EditorFindController(f.editor, { onChange: (s) => seen.push(s) })
    c.refresh(opts)
    f.type('path\npath\npath')
    expect(seen).toHaveLength(0)
    vi.advanceTimersByTime(100)
    expect(seen.at(-1)).toMatchObject({ count: 3 })
    expect(f.selection()).toBeNull()
  })

  it('merges a burst of edits into one recompute', () => {
    const f = fakeEditor('path')
    const seen: FindSnapshot[] = []
    const c = new EditorFindController(f.editor, { onChange: (s) => seen.push(s) })
    c.refresh(opts)
    f.type('path 1'); f.type('path 12'); f.type('path 123')
    vi.advanceTimersByTime(100)
    expect(seen).toHaveLength(1)
  })

  it('does not treat its own replacements as outside edits', () => {
    const f = fakeEditor('path path')
    const seen: FindSnapshot[] = []
    const c = new EditorFindController(f.editor, { onChange: (s) => seen.push(s) })
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'x')
    const before = seen.length
    vi.advanceTimersByTime(200)
    expect(seen.length).toBe(before)
  })

  it('stops recomputing after dispose', () => {
    const f = fakeEditor('path')
    const seen: FindSnapshot[] = []
    const c = new EditorFindController(f.editor, { onChange: (s) => seen.push(s) })
    c.refresh(opts)
    f.type('path path')
    c.dispose()
    vi.advanceTimersByTime(200)
    expect(seen).toHaveLength(0)
  })
})
