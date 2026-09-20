import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelRequests } from '../usePanelRequests'
import { usePanelRequestStore } from '@/stores/panelRequestStore'

beforeEach(() => usePanelRequestStore.setState({ request: null }))

describe('usePanelRequests', () => {
  it('does nothing until a panel is requested', () => {
    const setPanel = vi.fn()
    renderHook(() => usePanelRequests(setPanel))
    expect(setPanel).not.toHaveBeenCalled()
  })

  it('switches to the requested panel', () => {
    const setPanel = vi.fn()
    renderHook(() => usePanelRequests(setPanel))
    act(() => usePanelRequestStore.getState().requestPanel('files'))
    expect(setPanel).toHaveBeenCalledWith('files')
  })

  it('switches again on a repeat request, even for the panel that was just requested', () => {
    const setPanel = vi.fn()
    renderHook(() => usePanelRequests(setPanel))
    act(() => usePanelRequestStore.getState().requestPanel('llama'))
    act(() => usePanelRequestStore.getState().requestPanel('llama'))
    expect(setPanel).toHaveBeenCalledTimes(2)
  })

  it('does not replay an old request when a new consumer mounts', () => {
    // App mounts once, but a stale request left in the store must not yank the
    // panel the moment something remounts.
    usePanelRequestStore.getState().requestPanel('llama')
    const setPanel = vi.fn()
    renderHook(() => usePanelRequests(setPanel))
    expect(setPanel).not.toHaveBeenCalled()
  })
})
