/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import type { GitStatus } from '@/types/index'

const status: GitStatus = {
  staged: [],
  unstaged: [
    { path: 'src/App.tsx', status: 'M' },
    { path: 'old.ts', status: 'D' },
    { path: 'scratch.ts', status: '?' },
  ],
}

beforeEach(() => {
  ;(global as any).window.api = {
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue(status),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    revealInFinder: vi.fn().mockResolvedValue(undefined),
    trashPath: vi.fn().mockResolvedValue(undefined),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({
    repos: { '/proj': { ...emptyRepoGitState, status, commandStatus: 'idle', commitMessage: '', commitError: null } },
  })
})

afterEach(() => {
  cleanup()
})

function rightClickFile(path: string) {
  fireEvent.contextMenu(screen.getByTitle(path))
}

describe('GitPanel — Reveal in Finder', () => {
  it('reveals a changed file using its full path', () => {
    render(<GitPanel />)
    rightClickFile('src/App.tsx')
    fireEvent.click(screen.getByRole('button', { name: 'Reveal in Finder' }))
    expect(window.api.revealInFinder).toHaveBeenCalledWith('/proj/src/App.tsx')
  })

  it('reveals a changed file in the file tree', () => {
    useSidebarUiStore.setState({ revealRequest: null })
    render(<GitPanel />)
    rightClickFile('src/App.tsx')
    fireEvent.click(screen.getByRole('button', { name: 'Reveal in Site Tree' }))
    expect(useSidebarUiStore.getState().revealRequest?.path).toBe('/proj/src/App.tsx')
  })

  it('offers neither reveal for a deleted file', () => {
    render(<GitPanel />)
    rightClickFile('old.ts')
    expect(screen.queryByRole('button', { name: 'Reveal in Site Tree' })).toBeNull()
  })

  it('does not offer it for a deleted file', () => {
    render(<GitPanel />)
    rightClickFile('old.ts')
    expect(screen.queryByRole('button', { name: 'Reveal in Finder' })).toBeNull()
  })
})

describe('GitPanel — Move to Trash asks first', () => {
  it('does not trash an untracked file until confirmed', async () => {
    render(<GitPanel />)
    rightClickFile('scratch.ts')
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    expect(window.api.trashPath).not.toHaveBeenCalled()
    expect(screen.getByText(/to the Trash\?/)).toHaveTextContent('scratch.ts')

    fireEvent.click(screen.getAllByRole('button', { name: 'Move to Trash' }).at(-1)!)
    await waitFor(() => expect(window.api.trashPath).toHaveBeenCalledWith('/proj/scratch.ts'))
  })

  it('leaves the file alone when cancelled', () => {
    render(<GitPanel />)
    rightClickFile('scratch.ts')
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(window.api.trashPath).not.toHaveBeenCalled()
    expect(screen.queryByText(/to the Trash\?/)).toBeNull()
  })
})
