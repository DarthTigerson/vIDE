/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { TabBar } from '../TabBar'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { buildBrowserPath } from '@/components/Settings/paths'

const BROWSER_PATH = buildBrowserPath('tab-1')

function setup() {
  // A page title that happens to end in ".js" — this is exactly what used
  // to fool FileIcon's extension-sniffing into showing a JS file badge for
  // a browser tab, since FileIcon was built for editor file tabs and reads
  // whatever text follows the last dot as if it were a file extension.
  useBrowserStore.setState({
    tabs: { 'tab-1': { url: 'https://example.com/app.js', title: 'app.js' } as any },
    fullscreenId: null,
  })
  useEditorStore.setState({
    tabs: [{ path: BROWSER_PATH, content: '', dirty: false }],
    activeTabPath: BROWSER_PATH,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': BROWSER_PATH },
    paneTabLists: { 'pane-1': [BROWSER_PATH] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
}

afterEach(() => cleanup())

describe('TabBar — browser tab icon', () => {
  it('never shows a FileIcon extension badge for a browser tab, even when the page title looks like a filename', () => {
    setup()
    render(<TabBar paneId="pane-1" />)
    expect(screen.getByText('app.js')).toBeInTheDocument()
    expect(screen.queryByText('JSX')).not.toBeInTheDocument()
    expect(screen.queryByText('JS')).not.toBeInTheDocument()
  })
})

describe('TabBar — tab sizing', () => {
  it('gives browser tabs a max/min width, an ellipsis label with a full-title tooltip, and a non-shrinking close button', () => {
    setup()
    useBrowserStore.setState({
      tabs: { 'tab-1': { url: 'https://example.com', title: 'A very long page title that will not fit' } as any },
    })
    render(<TabBar paneId="pane-1" />)
    const label = screen.getByText('A very long page title that will not fit')
    expect(label).toHaveClass('truncate')
    const tab = label.parentElement!
    expect(tab.className).toContain('max-w-[220px]')
    expect(tab.className).toContain('min-w-[4.5rem]')
    expect(screen.getByLabelText(/^Close /)).toHaveClass('shrink-0')
  })

  it('sizes file tabs the same way as browser tabs', () => {
    setup()
    const filePath = '/repo/readme.txt'
    useEditorStore.setState({
      tabs: [{ path: filePath, content: '', dirty: false }],
      paneTabs: { 'pane-1': filePath },
      paneTabLists: { 'pane-1': [filePath] },
    })
    render(<TabBar paneId="pane-1" />)
    const label = screen.getByText('readme.txt')
    expect(label).toHaveClass('truncate')
    expect(label.parentElement!.className).toContain('max-w-[220px]')
    expect(label.parentElement!.className).toContain('min-w-[4.5rem]')
  })
})

describe('TabBar — icon-only tabs when crowded', () => {
  afterEach(() => vi.unstubAllGlobals())

  function renderWithStripWidth(width: number) {
    let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: typeof report) { report = cb }
      observe() {}
      disconnect() {}
    })
    const paths = ['/repo/alpha.ts', '/repo/beta.ts', '/repo/gamma.ts']
    useEditorStore.setState({
      tabs: paths.map((path) => ({ path, content: '', dirty: false })),
      activeTabPath: paths[0],
      layout: { type: 'pane', id: 'pane-1' },
      activePaneId: 'pane-1',
      paneTabs: { 'pane-1': paths[0] },
      paneTabLists: { 'pane-1': paths },
      closedTabs: [],
      pinnedPaths: new Set(),
    })
    render(<TabBar paneId="pane-1" />)
    act(() => report!([{ contentRect: { width } }]))
  }

  it('shows only the icon on inactive tabs, keeping the active tab readable and closable', () => {
    renderWithStripWidth(200) // ~67px per tab
    expect(screen.getByText('beta.ts')).toHaveClass('hidden')
    expect(screen.getByLabelText('Close beta.ts')).toHaveClass('hidden')
    expect(screen.getByText('alpha.ts')).not.toHaveClass('hidden')
    expect(screen.getByLabelText('Close alpha.ts')).not.toHaveClass('hidden')
  })

  it('shows the full name in a vIDE tooltip (not a native title) when hovering an icon-only tab', () => {
    vi.useFakeTimers()
    try {
      renderWithStripWidth(200)
      const beta = screen.getByText('beta.ts').parentElement!
      expect(beta).not.toHaveAttribute('title')
      fireEvent.mouseEnter(beta)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('tooltip')).toHaveTextContent('beta.ts')
      fireEvent.mouseLeave(beta)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows no tooltip for a tab whose name already fits', () => {
    vi.useFakeTimers()
    try {
      renderWithStripWidth(600)
      fireEvent.mouseEnter(screen.getByText('beta.ts').parentElement!)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps names on every tab while there is room', () => {
    renderWithStripWidth(600)
    expect(screen.getByText('beta.ts')).not.toHaveClass('hidden')
    expect(screen.getByLabelText('Close beta.ts')).not.toHaveClass('hidden')
  })
})
