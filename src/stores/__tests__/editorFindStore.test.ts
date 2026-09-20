import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorFindStore } from '../editorFindStore'

const get = () => useEditorFindStore.getState()

beforeEach(() => {
  useEditorFindStore.setState({
    query: '', replacement: '', caseSensitive: false, wholeWord: false, regex: false,
    panes: {}, navRequest: null,
  })
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
    expect(get().query).toBe('needle')
  })

  it('keeps the previous query when there is no usable selection', () => {
    get().setQuery('old')
    get().openFind('p1', { seed: '' })
    get().openFind('p1', { seed: null })
    get().openFind('p1', { seed: 'two\nlines' })
    get().openFind('p1', { seed: 'x'.repeat(500) })
    expect(get().query).toBe('old')
  })
})

describe('editorFindStore — shared search state', () => {
  it('flips the case / whole word / regex flags', () => {
    get().toggle('caseSensitive'); get().toggle('wholeWord'); get().toggle('regex')
    expect(get()).toMatchObject({ caseSensitive: true, wholeWord: true, regex: true })
    get().toggle('regex')
    expect(get().regex).toBe(false)
  })

  it('stores the query and replacement text', () => {
    get().setQuery('a'); get().setReplacement('b')
    expect(get()).toMatchObject({ query: 'a', replacement: 'b' })
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
