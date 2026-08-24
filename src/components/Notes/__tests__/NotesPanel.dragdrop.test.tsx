/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
import { NotesPanel } from '../NotesPanel'
import { useNotesStore } from '@/stores/notesStore'
import type { FileNode } from '@/types/index'

const ROOT = '/fake/userData/notes'
const WORK = `${ROOT}/Work`
const CHAPTER = `${ROOT}/Work/Chapter`

const chapterChildren: FileNode[] = [
  { name: 'Page.md', path: `${CHAPTER}/Page.md`, isDirectory: false },
]
const workChildren: FileNode[] = [
  { name: 'Chapter', path: CHAPTER, isDirectory: true },
  { name: 'Idea.md', path: `${WORK}/Idea.md`, isDirectory: false },
]
const rootChildren: FileNode[] = [
  { name: 'Work', path: WORK, isDirectory: true },
  { name: 'Loose.md', path: `${ROOT}/Loose.md`, isDirectory: false },
]

function nodeId(path: string) {
  return `#file-tree-node\\:${CSS.escape(path)}`
}

function dataTransferFor(path: string) {
  return { getData: () => path, setData: vi.fn(), dropEffect: '' } as unknown as DataTransfer
}

let renamePath: ReturnType<typeof vi.fn>
let pathExists: ReturnType<typeof vi.fn>

beforeEach(() => {
  renamePath = vi.fn().mockResolvedValue(undefined)
  pathExists = vi.fn().mockResolvedValue(false)
  const readDir = vi.fn((dir: string) => {
    if (dir === ROOT) return Promise.resolve(rootChildren)
    if (dir === WORK) return Promise.resolve(workChildren)
    if (dir === CHAPTER) return Promise.resolve(chapterChildren)
    return Promise.resolve([])
  })
  ;(global as any).window.api = {
    readDir,
    renamePath,
    pathExists,
    notesGetRoot: vi.fn().mockResolvedValue(ROOT),
  }
  useNotesStore.setState({ root: null })
})

afterEach(() => {
  cleanup()
})

async function renderWithWorkExpanded() {
  const utils = render(<NotesPanel />)
  await waitFor(() => expect(utils.container.querySelector(nodeId(WORK))).toBeTruthy())
  fireEvent.click(utils.container.querySelector(nodeId(WORK))!)
  await waitFor(() => expect(utils.container.querySelector(nodeId(`${WORK}/Idea.md`))).toBeTruthy())
  return utils
}

describe('NotesPanel — drag and drop', () => {
  it('moves a note into a book it is dropped on', async () => {
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(WORK)) as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor(`${ROOT}/Loose.md`) })

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith(`${ROOT}/Loose.md`, `${WORK}/Loose.md`)
    })
  })

  it('does not move a book into itself', async () => {
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(WORK)) as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor(WORK) })

    expect(renamePath).not.toHaveBeenCalled()
  })

  it('does not move a book into its own chapter', async () => {
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(CHAPTER)) as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor(WORK) })

    expect(renamePath).not.toHaveBeenCalled()
  })

  it('skips the move when the destination name already exists', async () => {
    pathExists.mockResolvedValue(true)
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(WORK)) as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor(`${ROOT}/Loose.md`) })

    await waitFor(() => expect(pathExists).toHaveBeenCalled())
    expect(renamePath).not.toHaveBeenCalled()
  })

  it('moves an item back to the notes root when dropped on empty space', async () => {
    const { container } = await renderWithWorkExpanded()
    const scrollArea = container.querySelector('.overflow-y-auto') as HTMLElement

    fireEvent.drop(scrollArea, { dataTransfer: dataTransferFor(`${WORK}/Idea.md`) })

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith(`${WORK}/Idea.md`, `${ROOT}/Idea.md`)
    })
  })
})

describe('NotesPanel — undo a move', () => {
  it('shows an Undo toast after a successful move, and clicking it reverses the move', async () => {
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(WORK)) as HTMLElement

    fireEvent.drop(target, { dataTransfer: dataTransferFor(`${ROOT}/Loose.md`) })
    await waitFor(() => expect(renamePath).toHaveBeenCalledWith(`${ROOT}/Loose.md`, `${WORK}/Loose.md`))

    expect(screen.getByText('Undo')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Undo'))

    await waitFor(() => {
      expect(renamePath).toHaveBeenCalledWith(`${WORK}/Loose.md`, `${ROOT}/Loose.md`)
    })
    expect(screen.queryByText('Undo')).not.toBeInTheDocument()
  })

  it('auto-dismisses the Undo toast after 10 seconds', async () => {
    const { container } = await renderWithWorkExpanded()
    const target = container.querySelector(nodeId(WORK)) as HTMLElement

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fireEvent.drop(target, { dataTransfer: dataTransferFor(`${ROOT}/Loose.md`) })
      await vi.waitFor(() => expect(renamePath).toHaveBeenCalledTimes(1))

      expect(screen.getByText('Undo')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(10000)
      expect(screen.queryByText('Undo')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
