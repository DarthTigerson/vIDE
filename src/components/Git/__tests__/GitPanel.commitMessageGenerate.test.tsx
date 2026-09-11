import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from '../GitPanel'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { CLAUDE_WORKING_GIFS } from '@/assets/claudeGifs'
import type { GitStatus } from '@/types/index'

const staged: GitStatus = {
  staged: [{ path: 'src/App.tsx', status: 'M' }],
  unstaged: [],
}
const nothingStaged: GitStatus = { staged: [], unstaged: [] }

beforeEach(() => {
  ;(global as any).window.api = {
    // RepoSection does a full refresh (branch + ahead/behind + status) on mount.
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue(staged),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    gitStagedDiff: vi.fn().mockResolvedValue('diff --git a/x b/x'),
    commitMessageGenerate: vi.fn().mockResolvedValue('Fix the login bug'),
  }
  useFileStore.setState({ projectRoot: '/proj' })
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
  useGitStore.setState({
    repos: {
      '/proj': { ...emptyRepoGitState, status: staged, commandStatus: 'idle', commitMessage: '', commitError: null },
    },
  })
  useCommitMessageSettingsStore.setState({ enabled: true, model: 'claude-sonnet-5', prompt: '' })
})

afterEach(() => {
  cleanup()
})

function generateButton() {
  return screen.getByTitle('Generate commit message from staged changes with Claude')
}

describe('GitPanel — generate commit message', () => {
  it('is hidden when the feature is disabled in settings', () => {
    useCommitMessageSettingsStore.setState({ enabled: false })
    render(<GitPanel />)
    expect(screen.queryByTitle('Generate commit message from staged changes with Claude')).toBeNull()
  })

  it('is disabled when nothing is staged', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: nothingStaged } } })
    render(<GitPanel />)
    expect(generateButton()).toBeDisabled()
  })

  it('fetches the staged diff and fills the commit message on success', async () => {
    render(<GitPanel />)
    fireEvent.click(generateButton())

    await waitFor(() => expect(useGitStore.getState().repos['/proj'].commitMessage).toBe('Fix the login bug'))
    expect(window.api.gitStagedDiff).toHaveBeenCalledWith('/proj')
    expect(window.api.commitMessageGenerate).toHaveBeenCalledWith('diff --git a/x b/x', 'claude-sonnet-5', '')
  })

  it('passes the configured model and custom prompt through', async () => {
    useCommitMessageSettingsStore.setState({ model: 'claude-opus-5', prompt: 'Always mention the ticket number' })
    render(<GitPanel />)
    fireEvent.click(generateButton())

    await waitFor(() => expect(window.api.commitMessageGenerate).toHaveBeenCalled())
    expect(window.api.commitMessageGenerate).toHaveBeenCalledWith(
      'diff --git a/x b/x',
      'claude-opus-5',
      'Always mention the ticket number'
    )
  })

  it('overwrites an existing commit message rather than appending', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: staged, commitMessage: 'wip' } } })
    render(<GitPanel />)
    fireEvent.click(generateButton())

    await waitFor(() => expect(useGitStore.getState().repos['/proj'].commitMessage).toBe('Fix the login bug'))
  })

  it('shows an error and leaves the message box alone when generation fails', async () => {
    ;(window.api.commitMessageGenerate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, status: staged, commitMessage: 'wip' } } })
    render(<GitPanel />)
    fireEvent.click(generateButton())

    await waitFor(() => expect(screen.getByText('Could not generate a commit message')).toBeTruthy())
    expect(useGitStore.getState().repos['/proj'].commitMessage).toBe('wip')
  })

  it('swaps to a looping gif while generating, then reverts to the Claude icon once done', async () => {
    let resolveGenerate!: (msg: string) => void
    window.api.commitMessageGenerate = vi.fn(
      () => new Promise<string>((resolve) => { resolveGenerate = resolve })
    ) as any
    render(<GitPanel />)

    expect(generateButton().querySelector('img')).toBeNull()

    fireEvent.click(generateButton())
    await waitFor(() => expect(generateButton().querySelector('img')).not.toBeNull())
    expect(CLAUDE_WORKING_GIFS).toContain(generateButton().querySelector('img')?.getAttribute('src'))

    resolveGenerate('Fix the login bug')
    await waitFor(() => expect(generateButton().querySelector('img')).toBeNull())
  })

  it('picks a gif from the pool depending on the random roll', async () => {
    window.api.commitMessageGenerate = vi.fn(
      () => new Promise<string>(() => {}) // never resolves — only the picked gif matters here
    ) as any
    const randomSpy = vi.spyOn(Math, 'random')

    randomSpy.mockReturnValue(0)
    const { unmount } = render(<GitPanel />)
    fireEvent.click(generateButton())
    await waitFor(() =>
      expect(generateButton().querySelector('img')?.getAttribute('src')).toBe(CLAUDE_WORKING_GIFS[0])
    )
    unmount()

    randomSpy.mockReturnValue(0.99)
    render(<GitPanel />)
    fireEvent.click(generateButton())
    await waitFor(() =>
      expect(generateButton().querySelector('img')?.getAttribute('src')).toBe(
        CLAUDE_WORKING_GIFS[CLAUDE_WORKING_GIFS.length - 1]
      )
    )

    randomSpy.mockRestore()
  })
})
