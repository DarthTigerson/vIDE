// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { EditorFindController, type FindSnapshot } from '../editorFindController'
import type { FindOptions } from '../findInText'

// The controller against a REAL Monaco editor (not the fake in
// editorFindController.test.ts): real edit ranges, real undo stack, real
// decorations. Monaco needs a few browser APIs jsdom lacks.

const opts: FindOptions = { query: 'path', caseSensitive: false, wholeWord: false, regex: false }

let monaco: typeof Monaco

beforeAll(async () => {
  const g = globalThis as any
  g.matchMedia = g.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  g.ResizeObserver = g.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} }
  g.CSS = g.CSS ?? { escape: (v: string) => v, supports: () => false }
  ;(document as any).queryCommandSupported = () => false
  ;(HTMLCanvasElement.prototype as any).getContext = function () {
    return new Proxy({ canvas: this }, {
      get: (t: any, k: string) => {
        if (k in t) return t[k]
        if (k === 'measureText') return () => ({ width: 8 })
        if (k === 'webkitBackingStorePixelRatio') return 1
        // Monaco reads pixels back when measuring fonts.
        if (k === 'getImageData' || k === 'createImageData') return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(4 * Math.max(1, w * h)), width: w, height: h })
        return () => undefined
      },
      set: (t: any, k: string, v: unknown) => { t[k] = v; return true },
    })
  }
  // The deep ESM entry (editor.api, no bundled find/language contributions) has no
  // type declarations under this module resolution, so type it as the package root.
  // @ts-ignore
  monaco = (await import('monaco-editor/esm/vs/editor/editor.api')) as unknown as typeof Monaco
}, 60_000)

const disposers: Array<() => void> = []
afterEach(() => { while (disposers.length) disposers.pop()!() })

function create(text: string) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const model = monaco.editor.createModel(text)
  const editor = monaco.editor.create(el, { model })
  disposers.push(() => { editor.dispose(); model.dispose(); el.remove() })
  return { editor, model }
}

const selected = (e: ReturnType<typeof create>) => e.model.getValueInRange(e.editor.getSelection()!)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('EditorFindController on a real Monaco editor', () => {
  it('finds, selects and reveals the current match', () => {
    const e = create('one\ntwo path\nthree path')
    const c = new EditorFindController(e.editor)
    expect(c.refresh(opts, { select: true })).toMatchObject({ count: 2, current: 1 })
    expect(selected(e)).toBe('path')
    expect(e.editor.getSelection()!.startLineNumber).toBe(2)
    expect(c.next()).toMatchObject({ current: 2 })
    expect(e.editor.getSelection()!.startLineNumber).toBe(3)
  })

  it('decorates every match plus the current one, with scrollbar marks', () => {
    const e = create('path a path b path')
    const c = new EditorFindController(e.editor, { matchColor: '#123456' })
    c.refresh(opts, { select: true })
    const decorations = e.model.getAllDecorations()
    expect(decorations.filter((d) => d.options.inlineClassName === 'find-match')).toHaveLength(3)
    expect(decorations.filter((d) => d.options.inlineClassName === 'find-match-current')).toHaveLength(1)
    expect(decorations.some((d) => d.options.overviewRuler?.color === '#123456')).toBe(true)
    c.dispose()
    expect(e.model.getAllDecorations().filter((d) => String(d.options.inlineClassName).startsWith('find-match'))).toHaveLength(0)
  })

  it('Replace edits the text, jumps to the next match, and one Cmd+Z undoes just that replacement', () => {
    const e = create('path a\npath b\npath c')
    const c = new EditorFindController(e.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'X')
    expect(e.model.getValue()).toBe('X a\npath b\npath c')
    expect(selected(e)).toBe('path')
    expect(e.editor.getSelection()!.startLineNumber).toBe(2)

    e.model.undo()
    expect(e.model.getValue()).toBe('path a\npath b\npath c')
  })

  it('two Replaces are two undo steps', () => {
    const e = create('path a\npath b\npath c')
    const c = new EditorFindController(e.editor)
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'X')
    c.replaceCurrent(opts, 'Y')
    expect(e.model.getValue()).toBe('X a\nY b\npath c')
    e.model.undo()
    expect(e.model.getValue()).toBe('X a\npath b\npath c')
    e.model.undo()
    expect(e.model.getValue()).toBe('path a\npath b\npath c')
  })

  it('Replace all changes every match and one Cmd+Z restores all of them', () => {
    const e = create('path a path\nx\npath')
    const c = new EditorFindController(e.editor)
    c.refresh(opts)
    expect(c.replaceAll(opts, 'P')).toBe(3)
    expect(e.model.getValue()).toBe('P a P\nx\nP')
    e.model.undo()
    expect(e.model.getValue()).toBe('path a path\nx\npath')
  })

  it('expands $1 in regex mode across several matches on a line', () => {
    const e = create('get(1) get(22)')
    const c = new EditorFindController(e.editor)
    const o: FindOptions = { ...opts, query: 'get\\((\\d+)\\)', regex: true }
    c.refresh(o)
    c.replaceAll(o, 'f$1')
    expect(e.model.getValue()).toBe('f1 f22')
  })

  it('does not treat its own edits as outside edits, but follows real outside ones', async () => {
    const e = create('path\npath')
    const seen: FindSnapshot[] = []
    const c = new EditorFindController(e.editor, { onChange: (s) => seen.push(s) })
    c.refresh(opts, { select: true })
    c.replaceCurrent(opts, 'X')
    await wait(120)
    expect(seen).toHaveLength(0)

    e.editor.executeEdits('typing', [{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, text: 'path path ' }])
    await wait(120)
    expect(seen.at(-1)).toMatchObject({ count: 3 })
  })

  it('works on a CRLF file, including a multi-line replacement', () => {
    const e = create('path a\r\npath b')
    e.model.setEOL(monaco.editor.EndOfLineSequence.CRLF)
    const c = new EditorFindController(e.editor)
    c.refresh(opts, { select: true })
    expect(c.getSnapshot().count).toBe(2)
    c.replaceCurrent(opts, 'x\ny')
    expect(e.model.getValue()).toBe('x\r\ny a\r\npath b')
    expect(selected(e)).toBe('path')
    expect(e.editor.getSelection()!.startLineNumber).toBe(3)
  })

  it('counts columns correctly after emoji and accents', () => {
    const e = create('é😀 path')
    const c = new EditorFindController(e.editor)
    c.refresh(opts, { select: true })
    expect(selected(e)).toBe('path')
    c.replaceCurrent(opts, 'X')
    expect(e.model.getValue()).toBe('é😀 X')
  })
})
