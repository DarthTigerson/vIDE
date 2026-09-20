import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorFindBox } from '../EditorFindBox'
import { useEditorFindStore } from '@/stores/editorFindStore'
import { fakeEditor, sel } from '@/lib/__tests__/fakeFindEditor'

const DOC = 'const path = 1\nreturn path\nlet other = path'

function openBox(over: Partial<ReturnType<typeof useEditorFindStore.getState>> = {}, showReplace = false) {
  useEditorFindStore.setState({
    query: '', replacement: '', caseSensitive: false, wholeWord: false, regex: false,
    panes: { p1: { open: true, showReplace, focusTick: 1 } }, navRequest: null, ...over,
  })
}

const find = () => screen.getByRole('textbox', { name: /^find$/i }) as HTMLInputElement
const store = () => useEditorFindStore.getState()

beforeEach(() => { openBox() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('EditorFindBox — visibility', () => {
  it('renders nothing while closed, or without an editor', () => {
    const f = fakeEditor(DOC)
    useEditorFindStore.setState({ panes: { p1: { open: false, showReplace: false, focusTick: 0 } } })
    const { container, rerender } = render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(container.firstChild).toBeNull()
    openBox()
    rerender(<EditorFindBox paneId="p1" editor={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('only opens for its own pane', () => {
    const f = fakeEditor(DOC)
    const { container } = render(<EditorFindBox paneId="other" editor={f.editor} />)
    expect(container.firstChild).toBeNull()
  })

  it('focuses the search field when it opens, and again when asked to', () => {
    const f = fakeEditor(DOC)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(document.activeElement).toBe(find())
    find().blur()
    act(() => { store().openFind('p1') })
    expect(document.activeElement).toBe(find())
  })
})

describe('EditorFindBox — search only (one row)', () => {
  it('shows the field, count, arrows and close, and no replace controls', () => {
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(find().value).toBe('path')
    expect(screen.getByText('1 of 3')).toBeTruthy()
    for (const name of ['Previous Match', 'Next Match', 'Close', 'Toggle Replace']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('textbox', { name: /replace with/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^replace all$/i })).toBeNull()
  })

  it('says "No results" for a query with no matches, and nothing for an empty query', () => {
    const f = fakeEditor(DOC)
    openBox({ query: 'zzz' })
    const { unmount } = render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByText('No results')).toBeTruthy()
    unmount()
    openBox({ query: '' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.queryByText(/no results|of/i)).toBeNull()
  })

  it('flags an invalid regex instead of showing a count', () => {
    const f = fakeEditor(DOC)
    openBox({ query: '(oops', regex: true })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByText('Invalid regex')).toBeTruthy()
  })

  it('adds a plus when the match count was cut off', () => {
    const f = fakeEditor('path\n'.repeat(10_050))
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByText('1 of 10,000+')).toBeTruthy()
  })
})

describe('EditorFindBox — searching', () => {
  it('writes what you type to the store and selects the first match as you go', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.type(find(), 'path')
    expect(store().query).toBe('path')
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(f.selection()).toEqual(sel(1, 7))
  })

  it('Enter goes to the next match and Shift+Enter to the previous, wrapping around', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(find())
    await user.keyboard('{Enter}')
    expect(screen.getByText('1 of 3')).toBeTruthy() // first Enter lands on the current match
    await user.keyboard('{Enter}')
    expect(screen.getByText('2 of 3')).toBeTruthy()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(screen.getByText('1 of 3')).toBeTruthy()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(screen.getByText('3 of 3')).toBeTruthy()
  })

  it('has arrow buttons for next and previous', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(screen.getByRole('button', { name: 'Next Match' }))
    await user.click(screen.getByRole('button', { name: 'Next Match' }))
    expect(screen.getByText('2 of 3')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Previous Match' }))
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('re-runs when case / whole word / regex change, and reflects them', async () => {
    const user = userEvent.setup()
    const f = fakeEditor('Path path')
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByText(/of 2/)).toBeTruthy()
    const aa = screen.getByRole('button', { name: 'Match Case' })
    expect(aa.getAttribute('aria-pressed')).toBe('false')
    await user.click(aa)
    expect(screen.getByRole('button', { name: 'Match Case' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/of 1/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Match Case' }))

    await user.click(screen.getByRole('button', { name: 'Use Regular Expression' }))
    expect(store().regex).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Match Whole Word' }))
    expect(store().wholeWord).toBe(true)
  })

  it('follows edits made in the editor', () => {
    vi.useFakeTimers()
    const f = fakeEditor('path')
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByText(/of 1$/)).toBeTruthy()
    act(() => { f.type('path\npath\npath'); vi.advanceTimersByTime(100) })
    expect(screen.getByText(/of 3$/)).toBeTruthy()
  })

  it('moves on when the pane switches to another file', () => {
    const a = fakeEditor('path')
    const b = fakeEditor('path path path path')
    openBox({ query: 'path' })
    const { rerender } = render(<EditorFindBox paneId="p1" editor={a.editor} />)
    expect(screen.getByText(/of 1$/)).toBeTruthy()
    rerender(<EditorFindBox paneId="p1" editor={b.editor} />)
    expect(screen.getByText(/of 4$/)).toBeTruthy()
    expect(a.listenerCount()).toBe(0)
  })

  it('answers a next/previous request (F3), even one that opened the box', () => {
    const f = fakeEditor(DOC)
    useEditorFindStore.setState({ panes: {}, query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    act(() => { store().requestNav('p1', 1) })
    expect(screen.getByText('1 of 3')).toBeTruthy()
    act(() => { store().requestNav('p1', 1) })
    expect(screen.getByText('2 of 3')).toBeTruthy()
    expect(store().navRequest).toBeNull()
  })
})

describe('EditorFindBox — closing', () => {
  it('Escape closes the box and hands focus back to the editor', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(find())
    await user.keyboard('{Escape}')
    expect(store().panes.p1.open).toBe(false)
    expect(f.editor.focus).toHaveBeenCalled()
  })

  it('the corner × closes it too, and clears the highlights', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    const { container } = render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(f.decorations().length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(store().panes.p1.open).toBe(false)
    expect(container.firstChild).toBeNull()
    expect(f.decorations()).toEqual([])
  })
})

describe('EditorFindBox — replace', () => {
  it('the chevron opens the replace row, moving the count and arrows into a footer', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(screen.getByRole('button', { name: 'Toggle Replace' }))
    expect(store().panes.p1.showReplace).toBe(true)
    expect(screen.getByRole('textbox', { name: /replace with/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^replace$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^replace all$/i })).toBeTruthy()
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next Match' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('puts the count and arrows to the left of Replace all in the footer', () => {
    const f = fakeEditor(DOC)
    openBox({ query: 'path' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const count = screen.getByText('1 of 3')
    const all = screen.getByRole('button', { name: /^replace all$/i })
    expect(before(count, screen.getByRole('button', { name: 'Next Match' }))).toBe(true)
    expect(before(screen.getByRole('button', { name: 'Next Match' }), screen.getByRole('button', { name: /^replace$/i }))).toBe(true)
    expect(before(screen.getByRole('button', { name: /^replace$/i }), all)).toBe(true)
  })

  it('Replace changes the current match and jumps to the next', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path', replacement: 'file' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(screen.getByRole('button', { name: 'Next Match' })) // select the first match
    await user.click(screen.getByRole('button', { name: /^replace$/i }))
    expect(f.text()).toBe('const file = 1\nreturn path\nlet other = path')
    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(f.selection()).toEqual(sel(2, 8))
  })

  it('Replace all changes every match, and says how many', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path', replacement: 'file' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(screen.getByRole('button', { name: /^replace all$/i }))
    expect(f.text()).toBe('const file = 1\nreturn file\nlet other = file')
    expect(screen.getByText('Replaced 3')).toBeTruthy()
    expect(f.calls.executeEdits).toHaveLength(1)
  })

  it('the "Replaced N" note goes away by itself', async () => {
    vi.useFakeTimers()
    const f = fakeEditor(DOC)
    openBox({ query: 'path', replacement: 'file' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    act(() => { screen.getByRole('button', { name: /^replace all$/i }).click() })
    expect(screen.getByText('Replaced 3')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Replaced 3')).toBeNull()
  })

  it('disables Replace and Replace all when there is nothing to replace', () => {
    const f = fakeEditor(DOC)
    openBox({ query: 'zzz', replacement: 'x' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect((screen.getByRole('button', { name: /^replace$/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^replace all$/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Enter in the replace field replaces; Ctrl+Alt+Enter replaces all', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path', replacement: 'file' }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.click(screen.getByRole('button', { name: 'Next Match' }))
    await user.click(screen.getByRole('textbox', { name: /replace with/i }))
    await user.keyboard('{Enter}')
    expect(f.text()).toBe('const file = 1\nreturn path\nlet other = path')
    await user.keyboard('{Control>}{Alt>}{Enter}{/Alt}{/Control}')
    expect(f.text()).toBe('const file = 1\nreturn file\nlet other = file')
  })

  it('stores what you type in the replace field', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({}, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    await user.type(screen.getByRole('textbox', { name: /replace with/i }), 'abc')
    expect(store().replacement).toBe('abc')
  })

  it('hints at $1 groups only when regex is on', () => {
    const f = fakeEditor(DOC)
    openBox({ regex: false }, true)
    const { unmount } = render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByRole('textbox', { name: /replace with/i }).getAttribute('placeholder')).toBe('Replace')
    unmount()
    openBox({ regex: true }, true)
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    expect(screen.getByRole('textbox', { name: /replace with/i }).getAttribute('placeholder')).toMatch(/\$1/)
  })
})

describe('EditorFindBox — hover names', () => {
  it('names each icon button on hover, in the same black tooltip as the activity bar', async () => {
    const user = userEvent.setup()
    const f = fakeEditor(DOC)
    openBox({ query: 'path' })
    render(<EditorFindBox paneId="p1" editor={f.editor} />)
    for (const name of ['Match Case', 'Match Whole Word', 'Use Regular Expression', 'Toggle Replace', 'Previous Match', 'Next Match', 'Close']) {
      const button = screen.getByRole('button', { name })
      await user.hover(button)
      const tip = screen.getByRole('tooltip')
      expect(tip.textContent).toBe(name)
      expect(tip.className).toMatch(/bg-black\/90/)
      await user.unhover(button)
      expect(screen.queryByRole('tooltip')).toBeNull()
    }
  })
})
