/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'

const { lspState, openWithCategory } = vi.hoisted(() => ({
  lspState: { refresh: () => {}, installed: [] as { entry: { id: string } }[], loaded: true },
  openWithCategory: vi.fn(),
}))
vi.mock('@/stores/lspStatusStore', () => ({
  useLspStatusStore: (sel: (s: typeof lspState) => unknown) => sel(lspState),
  subscribeLspEvents: () => {},
}))
vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (sel: (s: { openWithCategory: typeof openWithCategory }) => unknown) => sel({ openWithCategory }),
}))
vi.mock('../LspServerRow', () => ({
  LspServerRow: ({ server }: { server: { entry: { id: string } } }) => <tr><td>lsp:{server.entry.id}</td></tr>,
}))

import { EditorSettingsPage } from '../EditorSettingsPage'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'

beforeEach(() => {
  useEditorSettingsStore.setState({ autoSaveEnabled: false, wordWrapEnabled: false, markdownOpenMode: 'editor' })
  ;(window as any).api = { getSystemMemoryUsage: vi.fn().mockResolvedValue({ totalBytes: 8 * 1024 ** 3, usedBytes: 4 * 1024 ** 3 }) }
})
afterEach(cleanup)

describe('EditorSettingsPage — feature blocks', () => {
  it('lays the page out as six blocks', () => {
    render(<EditorSettingsPage />)
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Auto save', 'Word wrap', 'Markdown files', 'SVG files', 'Autocomplete', 'Go to definition',
    ])
  })

  it('previews auto save: an unsaved dot while off, none while on', () => {
    const { rerender } = render(<EditorSettingsPage />)
    expect(screen.getByTestId('autosave-dirty-dot')).toBeInTheDocument()
    useEditorSettingsStore.setState({ autoSaveEnabled: true })
    rerender(<EditorSettingsPage />)
    expect(screen.queryByTestId('autosave-dirty-dot')).toBeNull()
  })

  it('previews word wrap and the markdown mode', () => {
    const { rerender } = render(<EditorSettingsPage />)
    expect(screen.getByTestId('word-wrap-preview').querySelector('[data-wrap]')).toHaveAttribute('data-wrap', 'false')
    expect(screen.getByTestId('markdown-preview').querySelector('[data-mode]')).toHaveAttribute('data-mode', 'editor')
    useEditorSettingsStore.setState({ wordWrapEnabled: true, markdownOpenMode: 'split' })
    rerender(<EditorSettingsPage />)
    expect(screen.getByTestId('word-wrap-preview').querySelector('[data-wrap]')).toHaveAttribute('data-wrap', 'true')
    expect(screen.getByTestId('markdown-preview').querySelector('[data-mode]')).toHaveAttribute('data-mode', 'split')
  })

  it('lists only installed language servers and links to the Store category', () => {
    lspState.installed = []
    const { rerender } = render(<EditorSettingsPage />)
    const region = () => within(screen.getByRole('region', { name: 'Go to definition' }))
    expect(region().getByText('No language servers installed yet.')).toBeInTheDocument()
    fireEvent.click(region().getByRole('button', { name: 'Get language servers in the Store' }))
    expect(openWithCategory).toHaveBeenCalledWith('language-servers')

    lspState.installed = [{ entry: { id: 'go' } }, { entry: { id: 'rust' } }]
    rerender(<EditorSettingsPage />)
    expect(region().getAllByText(/^lsp:/).map((n) => n.textContent)).toEqual(['lsp:go', 'lsp:rust'])
  })
})
