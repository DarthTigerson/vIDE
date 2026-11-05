import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})
vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))

import { ExtensionOffNotice } from '../ExtensionOffNotice'
import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { buildExtensionOffPath } from '../paths'

const openPaths = () => Object.values(useEditorStore.getState().paneTabLists).flat()

function openNotice(extensionId: 'image-viewer', file: string) {
  const path = buildExtensionOffPath(extensionId, file)
  useEditorStore.getState().openTab({ path, content: '', dirty: false })
  return path
}

beforeEach(() => {
  ;(global as any).window.api = { readFile: vi.fn(async () => '<svg/>') }
  useExtensionsStore.setState({
    enabled: { 'image-viewer': false },
  })
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
    pinnedPaths: new Set(),
  } as never)
})

afterEach(() => cleanup())

describe('ExtensionOffNotice', () => {
  it('says the extension is turned off and offers only Enable for images', () => {
    render(<ExtensionOffNotice extensionId="image-viewer" path="/p/shot.png" />)
    expect(screen.getByText('Image viewer is turned off')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enable' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open as text' })).toBeNull()
  })

  it('Enable turns the extension on and reopens the file in its viewer', async () => {
    const notice = openNotice('image-viewer', '/p/shot.png')
    render(<ExtensionOffNotice extensionId="image-viewer" path="/p/shot.png" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() => expect(openPaths()).toEqual(['image-preview:///p/shot.png']))
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(true)
    expect(openPaths()).not.toContain(notice)
    expect((window as any).api.readFile).not.toHaveBeenCalled()
  })
})
