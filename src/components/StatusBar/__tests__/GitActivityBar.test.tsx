import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { GitActivityBar } from '../GitActivityBar'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'

beforeEach(() => {
  useGitReposStore.setState({ repos: ['/proj'], selectedRepo: '/proj' })
})

afterEach(() => {
  cleanup()
  useGitStore.setState({ repos: {} })
  useGitReposStore.setState({ repos: [], selectedRepo: null })
  vi.useRealTimers()
})

describe('GitActivityBar', () => {
  it('renders nothing while idle', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState } } })
    render(<GitActivityBar />)
    expect(screen.queryByTestId('git-activity-bar')).toBeNull()
  })

  it('shows the running bar while a git command is in flight', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commandStatus: 'running' } } })
    render(<GitActivityBar />)
    const bar = screen.getByTestId('git-activity-bar')
    expect(bar.className).toContain('git-activity-bar-running')
  })

  it('keeps the running bar visible for a full animation cycle even if the command finishes instantly', () => {
    vi.useFakeTimers()
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commandStatus: 'running' } } })
    render(<GitActivityBar />)
    act(() => {
      useGitStore.setState((s) => ({
        repos: { ...s.repos, '/proj': { ...s.repos['/proj'], commandStatus: 'idle' } },
      }))
    })
    // still visible immediately after — a real command this fast would
    // otherwise just flicker unnoticed
    expect(screen.getByTestId('git-activity-bar').className).toContain('git-activity-bar-running')

    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(screen.queryByTestId('git-activity-bar')).toBeNull()
  })

  it('flashes red when commandError increases', () => {
    vi.useFakeTimers()
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState } } })
    render(<GitActivityBar />)

    act(() => {
      useGitStore.setState((s) => ({
        repos: { ...s.repos, '/proj': { ...s.repos['/proj'], commandError: 1 } },
      }))
    })

    const bar = screen.getByTestId('git-activity-bar')
    expect(bar.className).toContain('git-activity-bar-error')

    act(() => {
      vi.advanceTimersByTime(1300)
    })
    expect(screen.queryByTestId('git-activity-bar')).toBeNull()
  })

  it('does not flash on first mount even if commandError already has a stale non-zero value', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commandError: 3 } } })
    render(<GitActivityBar />)
    expect(screen.queryByTestId('git-activity-bar')).toBeNull()
  })

  it('the error flash takes priority over an in-progress running bar', () => {
    vi.useFakeTimers()
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commandStatus: 'running' } } })
    render(<GitActivityBar />)

    act(() => {
      useGitStore.setState((s) => ({
        repos: { ...s.repos, '/proj': { ...s.repos['/proj'], commandStatus: 'idle', commandError: 1 } },
      }))
    })

    const bar = screen.getByTestId('git-activity-bar')
    expect(bar.className).toContain('git-activity-bar-error')
    expect(bar.className).not.toContain('git-activity-bar-running')
  })
})
