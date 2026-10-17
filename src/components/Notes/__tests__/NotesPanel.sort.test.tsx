/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { NotesPanel } from '../NotesPanel'
import { useNotesStore } from '@/stores/notesStore'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'
import type { FileNode } from '@/types/index'

const ROOT = '/fake/userData/notes'

const rootChildren: FileNode[] = [
  { name: '0.1.21.md', path: `${ROOT}/0.1.21.md`, isDirectory: false, createdMs: 3, updatedMs: 10 },
  { name: '0.1.3.md', path: `${ROOT}/0.1.3.md`, isDirectory: false, createdMs: 2, updatedMs: 30 },
  { name: '0.1.2.md', path: `${ROOT}/0.1.2.md`, isDirectory: false, createdMs: 1, updatedMs: 20 },
]

function shownNames(container: HTMLElement) {
  return [...container.querySelectorAll('[id^="file-tree-node:"]')].map((el) => el.textContent)
}

beforeEach(() => {
  localStorage.clear()
  ;(global as any).window.api = {
    notesReadDir: vi.fn().mockResolvedValue(rootChildren),
    renamePath: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    notesGetRoot: vi.fn().mockResolvedValue(ROOT),
    onNotesChanged: vi.fn(() => () => {}),
  }
  useNotesStore.setState({ root: null })
  useNotesSettingsStore.setState({ sort: 'alphabetical', order: {} })
})

afterEach(cleanup)

describe('NotesPanel — sorting', () => {
  it('sorts by the option picked from the right-click Sort by menu', async () => {
    const { container } = render(<NotesPanel />)
    await waitFor(() => expect(shownNames(container)).toEqual(['0.1.2', '0.1.3', '0.1.21']))

    fireEvent.contextMenu(container.querySelector('.overflow-y-auto')!)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Sort by' }).parentElement!)
    fireEvent.click(screen.getByText('Updated'))

    expect(useNotesSettingsStore.getState().sort).toBe('updated')
    expect(shownNames(container)).toEqual(['0.1.3', '0.1.2', '0.1.21'])
  })

  it('reorders by drag in Manual, and saves that order', async () => {
    useNotesSettingsStore.setState({ sort: 'manual' })
    const { container } = render(<NotesPanel />)
    await waitFor(() => expect(shownNames(container)).toEqual(['0.1.2', '0.1.3', '0.1.21']))
    const row = (name: string) => container.querySelector(`#file-tree-node\\:${CSS.escape(`${ROOT}/${name}`)}`)!
    const dataTransfer = { getData: () => `${ROOT}/0.1.21.md`, setData: vi.fn(), dropEffect: '' }

    fireEvent.dragStart(row('0.1.21.md'), { dataTransfer })
    // jsdom rows have no height, so the drop lands in the lower half: after.
    fireEvent.dragOver(row('0.1.2.md'), { dataTransfer })
    expect(screen.getByTestId('notes-drop-marker')).toBeInTheDocument()
    fireEvent.drop(row('0.1.2.md'), { dataTransfer })

    expect(shownNames(container)).toEqual(['0.1.2', '0.1.21', '0.1.3'])
    expect(useNotesSettingsStore.getState().order).toEqual({ '': ['0.1.2.md', '0.1.21.md', '0.1.3.md'] })
    expect(window.api.renamePath).not.toHaveBeenCalled()
  })

  it('does not reorder notes outside Manual (only folders take drops)', async () => {
    const { container } = render(<NotesPanel />)
    await waitFor(() => expect(shownNames(container)).toHaveLength(3))
    const row = container.querySelector(`#file-tree-node\\:${CSS.escape(`${ROOT}/0.1.2.md`)}`)!
    const dataTransfer = { getData: () => `${ROOT}/0.1.21.md`, setData: vi.fn(), dropEffect: '' }
    fireEvent.dragStart(container.querySelector(`#file-tree-node\\:${CSS.escape(`${ROOT}/0.1.21.md`)}`)!, { dataTransfer })
    fireEvent.dragOver(row, { dataTransfer })
    expect(screen.queryByTestId('notes-drop-marker')).toBeNull()
  })
})
