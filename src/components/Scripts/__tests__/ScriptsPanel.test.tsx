/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ScriptsPanel } from '../ScriptsPanel'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import type { Script } from '@/types/api'

const mk = (id: string, title: string): Script => ({ id, title, description: `about ${title}`, body: 'ls', shareOutput: true, createdAt: 1, updatedAt: 1 })

let openTab: ReturnType<typeof vi.fn>
let remove: ReturnType<typeof vi.fn>
let create: ReturnType<typeof vi.fn>

beforeEach(() => {
  openTab = vi.fn()
  remove = vi.fn(async () => {})
  create = vi.fn(async () => mk('new', 'Untitled script'))
  useEditorStore.setState({ openTab })
  useFileStore.setState({ projectRoot: '/p' })
  useScriptsStore.setState({ scripts: [mk('a', 'Alpha'), mk('b', 'Beta')], tags: { b: ['/p'] }, loaded: true, remove, create })
})
afterEach(() => cleanup())

describe('ScriptsPanel', () => {
  it('lists the current project\'s scripts first, with descriptions', () => {
    render(<ScriptsPanel />)
    const titles = screen.getAllByTestId('script-row-title').map((el) => el.textContent)
    expect(titles).toEqual(['Beta', 'Alpha'])
    expect(screen.getByText('about Alpha')).toBeInTheDocument()
  })

  it('filters by title and description', () => {
    render(<ScriptsPanel />)
    fireEvent.change(screen.getByLabelText('Search scripts'), { target: { value: 'about alp' } })
    expect(screen.getAllByTestId('script-row-title').map((el) => el.textContent)).toEqual(['Alpha'])
  })

  it('+ opens a New Script window; Create saves title and description, then opens the tab', async () => {
    render(<ScriptsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'New script' }))
    expect(create).not.toHaveBeenCalled()
    const createButton = screen.getByRole('button', { name: 'Create' })
    expect(createButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pre-commit' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Run before branching' } })
    fireEvent.click(createButton)
    await waitFor(() => expect(openTab).toHaveBeenCalledWith({ path: 'script://new', content: '', dirty: false }))
    expect(create).toHaveBeenCalledWith({ title: 'Pre-commit', description: 'Run before branching' })
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
  })

  it('Cancel closes the New Script window without creating', () => {
    render(<ScriptsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'New script' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('clicking a row opens its editor tab', () => {
    render(<ScriptsPanel />)
    fireEvent.click(screen.getByText('Alpha'))
    expect(openTab).toHaveBeenCalledWith({ path: 'script://a', content: '', dirty: false })
  })

  it('Delete asks for confirmation before removing', async () => {
    render(<ScriptsPanel />)
    fireEvent.contextMenu(screen.getByText('Alpha'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Script' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('a'))
  })
})
