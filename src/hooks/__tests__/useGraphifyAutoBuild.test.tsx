import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGraphifyAutoBuild } from '../useGraphifyAutoBuild'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'

beforeEach(() => {
  useGraphifySettingsStore.setState({ enabled: true, autoBuildOnOpen: true })
  useGraphifyStore.setState({ available: true, checking: false, running: false, run: vi.fn(), checkAvailable: vi.fn() })
})

describe('useGraphifyAutoBuild', () => {
  it('does nothing when the setting is off', () => {
    useGraphifySettingsStore.setState({ autoBuildOnOpen: false })
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    renderHook(() => useGraphifyAutoBuild('/proj/repoA'))
    expect(runMock).not.toHaveBeenCalled()
  })

  it('checks availability first when unknown, without running yet', () => {
    const checkMock = vi.fn()
    const runMock = vi.fn()
    useGraphifyStore.setState({ available: null, run: runMock, checkAvailable: checkMock })
    renderHook(() => useGraphifyAutoBuild('/proj/repoA'))
    expect(checkMock).toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
  })

  it('runs once for a newly-active repo when enabled and available', () => {
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    renderHook(() => useGraphifyAutoBuild('/proj/repoA'))
    expect(runMock).toHaveBeenCalledWith('/proj/repoA')
    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it('does not re-run for the same repo on re-render', () => {
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    const { rerender } = renderHook(({ repo }) => useGraphifyAutoBuild(repo), { initialProps: { repo: '/proj/repoA' } })
    rerender({ repo: '/proj/repoA' })
    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it('runs again for a different repo becoming active', () => {
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    const { rerender } = renderHook(({ repo }) => useGraphifyAutoBuild(repo), { initialProps: { repo: '/proj/repoA' } })
    act(() => { rerender({ repo: '/proj/repoB' }) })
    expect(runMock).toHaveBeenCalledWith('/proj/repoB')
    expect(runMock).toHaveBeenCalledTimes(2)
  })

  it('does not run when graphify itself is disabled, even with auto-build on', () => {
    useGraphifySettingsStore.setState({ enabled: false })
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    renderHook(() => useGraphifyAutoBuild('/proj/repoA'))
    expect(runMock).not.toHaveBeenCalled()
  })

  it('does not run when there is no active repo', () => {
    const runMock = vi.fn()
    useGraphifyStore.setState({ run: runMock })
    renderHook(() => useGraphifyAutoBuild(null))
    expect(runMock).not.toHaveBeenCalled()
  })
})
