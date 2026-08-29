/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { NotesPanel } from '../NotesPanel'
import { useNotesStore } from '@/stores/notesStore'
import { useEditorStore } from '@/stores/editorStore'
import type { FileNode } from '@/types/index'
import type { NotesSearchResult } from '@/types/api'

const ROOT = '/fake/userData/notes'

const rootChildren: FileNode[] = [{ name: 'Loose.md', path: `${ROOT}/Loose.md`, isDirectory: false }]

let notesSearch: ReturnType<typeof vi.fn>
let readFile: ReturnType<typeof vi.fn>

beforeEach(() => {
  notesSearch = vi.fn().mockResolvedValue([])
  readFile = vi.fn().mockResolvedValue('note body')
  ;(global as any).window.api = {
    readDir: vi.fn().mockResolvedValue(rootChildren),
    notesGetRoot: vi.fn().mockResolvedValue(ROOT),
    notesSearch,
    readFile,
    onNotesChanged: vi.fn(() => () => {}),
  }
  useNotesStore.setState({ root: null })
  useEditorStore.getState().resetForNewProject()
})

afterEach(() => {
  cleanup()
})

async function renderPanel() {
  const utils = render(<NotesPanel />)
  await waitFor(() => expect(screen.getByText('Loose')).toBeInTheDocument())
  return utils
}

async function openSearch() {
  fireEvent.click(screen.getByLabelText('Search Notes'))
  return (await screen.findByPlaceholderText('Press / to search')) as HTMLInputElement
}

describe('NotesPanel — search', () => {
  it('hides the search box until the search button is toggled on', async () => {
    await renderPanel()
    expect(screen.queryByPlaceholderText('Press / to search')).not.toBeInTheDocument()
    expect(notesSearch).not.toHaveBeenCalled()
  })

  it('toggles the search box open and closed via the search button', async () => {
    await renderPanel()
    const input = await openSearch()
    expect(input).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Search Notes'))

    expect(screen.queryByPlaceholderText('Press / to search')).not.toBeInTheDocument()
  })

  it('debounces and queries notesSearch, then renders matches', async () => {
    const results: NotesSearchResult[] = [
      { path: `${ROOT}/Work/Deep.md`, name: 'Deep.md', snippet: 'buried keyword here' },
    ]
    notesSearch.mockResolvedValue(results)
    await renderPanel()
    const input = await openSearch()

    fireEvent.change(input, { target: { value: 'keyword' } })

    await waitFor(() => expect(notesSearch).toHaveBeenCalledWith('keyword'))
    await waitFor(() => expect(screen.getByText('Deep')).toBeInTheDocument())
    expect(screen.getByText('buried keyword here')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('shows a no-matches message when the search returns nothing', async () => {
    notesSearch.mockResolvedValue([])
    await renderPanel()
    const input = await openSearch()

    fireEvent.change(input, { target: { value: 'nope' } })

    await waitFor(() => expect(notesSearch).toHaveBeenCalledWith('nope'))
    await waitFor(() => expect(screen.getByText('No notes match "nope"')).toBeInTheDocument())
  })

  it('opens the note when a result is clicked', async () => {
    const results: NotesSearchResult[] = [{ path: `${ROOT}/Idea.md`, name: 'Idea.md', snippet: null }]
    notesSearch.mockResolvedValue(results)
    await renderPanel()
    const input = await openSearch()

    fireEvent.change(input, { target: { value: 'idea' } })
    await waitFor(() => expect(screen.getByText('Idea')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Idea'))

    await waitFor(() => expect(readFile).toHaveBeenCalledWith(`${ROOT}/Idea.md`))
    expect(useEditorStore.getState().activeTabPath).toBe(`${ROOT}/Idea.md`)
  })

  it('clears the query and results via the clear button', async () => {
    notesSearch.mockResolvedValue([{ path: `${ROOT}/Idea.md`, name: 'Idea.md', snippet: null }])
    await renderPanel()
    const input = await openSearch()

    fireEvent.change(input, { target: { value: 'idea' } })
    await waitFor(() => expect(screen.getByText('Idea')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Clear search'))

    expect(input.value).toBe('')
    await waitFor(() => expect(screen.getByText('Loose')).toBeInTheDocument())
  })

  it('closing the search button clears the query and reverts to the tree', async () => {
    notesSearch.mockResolvedValue([{ path: `${ROOT}/Idea.md`, name: 'Idea.md', snippet: null }])
    await renderPanel()
    const input = await openSearch()
    fireEvent.change(input, { target: { value: 'idea' } })
    await waitFor(() => expect(screen.getByText('Idea')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Search Notes'))
    const reopened = await openSearch()

    expect(reopened.value).toBe('')
    await waitFor(() => expect(screen.getByText('Loose')).toBeInTheDocument())
  })

  it('opens and focuses the search box when "/" is pressed outside a text field', async () => {
    const { container } = await renderPanel()
    const root = container.firstChild as HTMLElement

    fireEvent.keyDown(root, { key: '/' })

    const input = await screen.findByPlaceholderText('Press / to search')
    expect(document.activeElement).toBe(input)
  })
})
