import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

// Mocks the REAL notes.ts module shape: its exported
// notesRoot/ensureNotesRoot/startNotesWatcher/createNote/createFolder/
// renameEntry/searchNotes functions — not a from-scratch reimplementation
// (the previous attempt duplicated these with real bugs: renameEntry
// dropped the existing-file collision guard, searchNotes was a weaker
// content-only search with a different return shape, and notes:getRoot
// never started the file watcher).
vi.mock('../../notes', () => ({
  notesRoot: vi.fn(() => '/fake/userData/notes'),
  ensureNotesRoot: vi.fn(async () => '/fake/userData/notes'),
  startNotesWatcher: vi.fn(),
  createNote: vi.fn(async (dirPath: string, name: string) => ({ path: `${dirPath}/${name}.md`, name: `${name}.md` })),
  createFolder: vi.fn(async (dirPath: string, name: string) => ({ path: `${dirPath}/${name}`, name })),
  renameEntry: vi.fn(async (oldPath: string, newName: string, isNote: boolean) => ({
    path: `/fake/userData/notes/${newName}${isNote ? '.md' : ''}`,
    name: isNote ? `${newName}.md` : newName,
  })),
  searchNotes: vi.fn(async (_root: string, query: string) => [{ path: '/fake/userData/notes/a.md', name: 'a.md', snippet: query }]),
}))

import { registerNotesRelayChannels } from '../channels/notesChannels'
import { notesRoot, ensureNotesRoot, startNotesWatcher, createNote, renameEntry, searchNotes } from '../../notes'

describe('notesChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
    registerNotesRelayChannels()
  })

  it('maps notes:getRoot to ensureNotesRoot and starts the watcher on the resolved root', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'notes:getRoot', args: [] })
    expect(res).toEqual({ type: 'response', id: '1', result: '/fake/userData/notes' })
    expect(ensureNotesRoot).toHaveBeenCalled()
    expect(startNotesWatcher).toHaveBeenCalledWith('/fake/userData/notes')
  })

  it('maps notes:createNote to createNote with dirPath and name in order', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'notes:createNote', args: ['/fake/userData/notes', 'todo'] })
    expect(res).toEqual({ type: 'response', id: '2', result: { path: '/fake/userData/notes/todo.md', name: 'todo.md' } })
    expect(createNote).toHaveBeenCalledWith('/fake/userData/notes', 'todo')
  })

  it('maps notes:renameEntry to renameEntry with oldPath, newName, isNote in order', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '3',
      method: 'notes:renameEntry',
      args: ['/fake/userData/notes/old.md', 'new', true],
    })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: { path: '/fake/userData/notes/new.md', name: 'new.md' },
    })
    expect(renameEntry).toHaveBeenCalledWith('/fake/userData/notes/old.md', 'new', true)
  })

  it('maps notes:search to searchNotes against notesRoot()', async () => {
    const res = await dispatch({ type: 'invoke', id: '4', method: 'notes:search', args: ['test query'] })
    expect(res).toEqual({
      type: 'response',
      id: '4',
      result: [{ path: '/fake/userData/notes/a.md', name: 'a.md', snippet: 'test query' }],
    })
    expect(notesRoot).toHaveBeenCalled()
    expect(searchNotes).toHaveBeenCalledWith('/fake/userData/notes', 'test query')
  })
})
