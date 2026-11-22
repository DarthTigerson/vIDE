import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorFindStore } from '../editorFindStore'

const get = () => useEditorFindStore.getState()

beforeEach(() => {
  useEditorFindStore.setState({ panes: {}, navRequest: null })
})

describe('editorFindStore — opening and closing per pane', () => {
  it('opens a pane with replace closed by default and asks its input to focus', () => {
    get().openFind('p1')
    expect(get().panes.p1).toMatchObject({ open: true, showReplace: false })
    expect(get().panes.p1.focusTick).toBeGreaterThan(0)
  })

  it('bumps the focus tick every time, so Cmd+F on an open box refocuses it', () => {
    get().openFind('p1')
    const first = get().panes.p1.focusTick
    get().openFind('p1')
    expect(get().panes.p1.focusTick).toBe(first + 1)
  })

  it('keeps panes independent', () => {
    get().openFind('p1', { replace: true })
    get().openFind('p2')
    expect(get().panes.p1.showReplace).toBe(true)
    expect(get().panes.p2.showReplace).toBe(false)
    get().closeFind('p1')
    expect(get().panes.p1.open).toBe(false)
    expect(get().panes.p2.open).toBe(true)
  })

  it('opens with replace when asked, and never collapses replace on a plain open', () => {
    get().openFind('p1', { replace: true })
    get().openFind('p1')
    expect(get().panes.p1.showReplace).toBe(true)
  })

  it('remembers whether replace was open across close and reopen', () => {
    get().openFind('p1', { replace: true })
    get().closeFind('p1')
    get().openFind('p1')
    expect(get().panes.p1.showReplace).toBe(true)
  })

  it('toggles replace for one pane', () => {
    get().openFind('p1')
    get().toggleReplace('p1')
    expect(get().panes.p1.showReplace).toBe(true)
    get().toggleReplace('p1')
    expect(get().panes.p1.showReplace).toBe(false)
  })

  it('closing a pane that was never opened is harmless', () => {
    get().closeFind('ghost')
    expect(get().panes.ghost?.open ?? false).toBe(false)
  })
})

describe('editorFindStore — seeding from the selection', () => {
  it('uses a single-line selection as the query', () => {
    get().openFind('p1', { seed: 'needle' })
    expect(get().panes.p1.query).toBe('needle')
  })

  it('keeps the previous query when there is no usable selection', () => {
    get().openFind('p1')
    get().setQuery('p1', 'old')
    get().openFind('p1', { seed: '' })
    get().openFind('p1', { seed: null })
    get().openFind('p1', { seed: 'two\nlines' })
    get().openFind('p1', { seed: 'x'.repeat(500) })
    expect(get().panes.p1.query).toBe('old')
  })

  it('seeds only the pane being opened', () => {
    get().openFind('p1', { seed: 'left' })
    get().openFind('p2', { seed: 'right' })
    expect(get().panes.p1.query).toBe('left')
    expect(get().panes.p2.query).toBe('right')
  })
})

describe('editorFindStore — search state per pane', () => {
  it('flips the case / whole word / regex flags', () => {
    get().toggle('p1', 'caseSensitive'); get().toggle('p1', 'wholeWord'); get().toggle('p1', 'regex')
    expect(get().panes.p1).toMatchObject({ caseSensitive: true, wholeWord: true, regex: true })
    get().toggle('p1', 'regex')
    expect(get().panes.p1.regex).toBe(false)
  })

  it('stores the query and replacement text', () => {
    get().setQuery('p1', 'a'); get().setReplacement('p1', 'b')
    expect(get().panes.p1).toMatchObject({ query: 'a', replacement: 'b' })
  })

  it('keeps each pane\'s search separate (split editors)', () => {
    get().openFind('p1'); get().openFind('p2')
    get().setQuery('p1', 'dist')
    get().setReplacement('p1', 'out')
    get().toggle('p1', 'regex')
    expect(get().panes.p2).toMatchObject({ query: '', replacement: '', regex: false })
    expect(get().panes.p1).toMatchObject({ query: 'dist', replacement: 'out', regex: true, open: true })
  })

  it('keeps the query across close and reopen', () => {
    get().openFind('p1'); get().setQuery('p1', 'x'); get().closeFind('p1'); get().openFind('p1')
    expect(get().panes.p1.query).toBe('x')
  })
})

describe('editorFindStore — next/previous requests (F3)', () => {
  it('opens a closed box and records the request for that pane', () => {
    get().requestNav('p1', 1)
    expect(get().panes.p1.open).toBe(true)
    expect(get().navRequest).toMatchObject({ paneId: 'p1', delta: 1 })
  })

  it('gives each request a new tick so pressing F3 twice is two requests', () => {
    get().requestNav('p1', 1)
    const first = get().navRequest!.tick
    get().requestNav('p1', -1)
    expect(get().navRequest).toMatchObject({ delta: -1 })
    expect(get().navRequest!.tick).toBeGreaterThan(first)
  })

  it('can be cleared once handled', () => {
    get().requestNav('p1', 1)
    get().clearNavRequest()
    expect(get().navRequest).toBeNull()
  })
})
