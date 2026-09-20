/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { OpenFileButton } from '../OpenFileButton'
import { useEditorStore } from '@/stores/editorStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'

let api: { pathExists: ReturnType<typeof vi.fn>; readFile: ReturnType<typeof vi.fn> }

beforeEach(() => {
  api = { pathExists: vi.fn().mockResolvedValue(true), readFile: vi.fn().mockResolvedValue('contents') }
  ;(global as any).window.api = api
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: {},
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
    pinnedPaths: new Set(),
  } as any)
  usePanelRequestStore.setState({ request: null })
})
afterEach(() => cleanup())

describe('OpenFileButton', () => {
  it('shows "Open File" once the file is confirmed to exist', async () => {
    render(<OpenFileButton absPath="/proj/a.ts" paneId="pane-1" />)
    expect(await screen.findByRole('button', { name: 'Open File' })).toBeInTheDocument()
    expect(api.pathExists).toHaveBeenCalledWith('/proj/a.ts')
  })

  it('renders nothing when the file no longer exists', async () => {
    api.pathExists.mockResolvedValue(false)
    const { container } = render(<OpenFileButton absPath="/proj/gone.ts" paneId="pane-1" />)
    await waitFor(() => expect(api.pathExists).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Open File' })).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the file in the given pane and switches to the file tree on click', async () => {
    render(<OpenFileButton absPath="/proj/a.ts" paneId="pane-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open File' }))
    await waitFor(() => expect(useEditorStore.getState().activeTabPath).toBe('/proj/a.ts'))
    expect(usePanelRequestStore.getState().request?.panel).toBe('files')
  })
})
