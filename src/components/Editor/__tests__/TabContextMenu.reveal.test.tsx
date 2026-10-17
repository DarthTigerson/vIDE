/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const platform = vi.hoisted(() => ({ mac: true }))
vi.mock('@/lib/platform', () => ({
  get isMac() { return platform.mac },
}))

import { TabContextMenu } from '../TabContextMenu'
import { useEditorStore } from '@/stores/editorStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { buildGitDiffPath } from '@/components/Git/paths'
import { GIT_SETTINGS_TAB_PATH } from '@/components/Settings/paths'

beforeEach(() => {
  platform.mac = true
  ;(global as any).window.api = {
    pathExists: vi.fn().mockResolvedValue(true),
    revealInFinder: vi.fn().mockResolvedValue(undefined),
  }
  useEditorStore.setState({
    tabs: [{ path: '/proj/a.ts', content: '', dirty: false }],
    activeTabPath: '/proj/a.ts',
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': '/proj/a.ts' },
    paneTabLists: { 'pane-1': ['/proj/a.ts'] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
  useSidebarUiStore.setState({ revealRequest: null })
})

afterEach(() => {
  cleanup()
})

function renderMenu(path: string) {
  render(<TabContextMenu x={10} y={10} paneId="pane-1" path={path} onRequestClose={() => {}} onClose={() => {}} />)
}

describe('TabContextMenu — reveal', () => {
  it('reveals a file tab in the file tree', async () => {
    renderMenu('/proj/a.ts')
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal in Site Tree' }))
    expect(useSidebarUiStore.getState().revealRequest?.path).toBe('/proj/a.ts')
  })

  it('reveals a file tab in Finder on macOS', async () => {
    renderMenu('/proj/a.ts')
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal in Finder' }))
    expect(window.api.revealInFinder).toHaveBeenCalledWith('/proj/a.ts')
  })

  it('does not offer Reveal in Finder on Linux', async () => {
    platform.mac = false
    renderMenu('/proj/a.ts')
    await screen.findByRole('button', { name: 'Reveal in Site Tree' })
    expect(screen.queryByRole('button', { name: 'Reveal in Finder' })).toBeNull()
  })

  it('reveals the real file behind a diff tab', async () => {
    renderMenu(buildGitDiffPath('/proj', 'src/b.ts', false))
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal in Finder' }))
    expect(window.api.revealInFinder).toHaveBeenCalledWith('/proj/src/b.ts')
  })

  it('offers neither when the file no longer exists', async () => {
    ;(window.api.pathExists as any).mockResolvedValue(false)
    renderMenu('/proj/a.ts')
    await screen.findByRole('button', { name: 'Copy File Path' })
    await Promise.resolve()
    expect(screen.queryByRole('button', { name: 'Reveal in Site Tree' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reveal in Finder' })).toBeNull()
  })

  it('offers neither for a tab with no file, like Settings', () => {
    renderMenu(GIT_SETTINGS_TAB_PATH)
    expect(screen.queryByRole('button', { name: 'Reveal in Site Tree' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reveal in Finder' })).toBeNull()
  })
})
