/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../TabBar'
import { useEditorStore } from '@/stores/editorStore'

afterEach(() => cleanup())

describe('TabBar — new file button', () => {
  it('opens one blank file in this pane, after the last tab', () => {
    const openScratchTab = vi.fn()
    useEditorStore.setState({
      tabs: [{ path: '/project/a.ts', content: '', dirty: false }],
      activeTabPath: '/project/a.ts',
      layout: { type: 'pane', id: 'pane-1' },
      activePaneId: 'pane-1',
      paneTabs: { 'pane-1': '/project/a.ts' },
      paneTabLists: { 'pane-1': ['/project/a.ts'] },
      closedTabs: [],
      pinnedPaths: new Set(),
      openScratchTab,
    } as any)
    render(<TabBar paneId="pane-1" />)
    const button = screen.getByRole('button', { name: 'New file' })
    expect(button.previousElementSibling?.textContent).toContain('a.ts')
    fireEvent.click(button)
    fireEvent.doubleClick(button)
    expect(openScratchTab).toHaveBeenCalledTimes(1)
    expect(openScratchTab).toHaveBeenCalledWith('pane-1')
  })
})
