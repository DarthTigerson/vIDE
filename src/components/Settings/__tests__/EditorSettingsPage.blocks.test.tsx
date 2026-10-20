/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'

vi.mock('@/stores/lspStatusStore', () => ({
  useLspStatusStore: (sel: (s: { refresh: () => void }) => unknown) => sel({ refresh: () => {} }),
  subscribeLspInstallEvents: () => {},
}))
vi.mock('../LspServerRow', () => ({ LspServerRow: ({ id }: { id: string }) => <div>lsp:{id}</div> }))

import { EditorSettingsPage } from '../EditorSettingsPage'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'

beforeEach(() => {
  useEditorSettingsStore.setState({ autoSaveEnabled: false, wordWrapEnabled: false, markdownOpenMode: 'editor' })
  ;(window as any).api = { getSystemMemoryUsage: vi.fn().mockResolvedValue({ totalBytes: 8 * 1024 ** 3, usedBytes: 4 * 1024 ** 3 }) }
})
afterEach(cleanup)

describe('EditorSettingsPage — feature blocks', () => {
  it('lays the page out as five blocks', () => {
    render(<EditorSettingsPage />)
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Auto save', 'Word wrap', 'Markdown files', 'Autocomplete', 'Go to definition',
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

  it('still lists every language server', () => {
    render(<EditorSettingsPage />)
    expect(within(screen.getByRole('region', { name: 'Go to definition' })).getAllByText(/^lsp:/).length).toBeGreaterThan(0)
  })
})
