import { describe, it, expect, beforeEach } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useFileStore } from '@/stores/fileStore'

// Rendering the full <App/> in jsdom isn't practical (see
// App.autoFollow.test.tsx's note on Monaco/xterm/react-resizable-panels
// needing real browser APIs), so — same pattern as that file — this
// reproduces App.tsx's project-closed sidebar fallback effect verbatim in
// isolation: falling back off Git/Docker/Mobile Display/Graphify (whose
// ActivityBar icons disappear without a project) to Explorer when
// projectRoot goes null, and keeping lastLeftPanelRef in sync so a later
// Cmd+B reopen doesn't try to restore a now-icon-less panel.
type LeftPanel = 'files' | 'git' | 'docker' | 'mobile' | 'graphify' | 'todos' | 'notes' | 'settings' | null
type NonNullLeftPanel = Exclude<LeftPanel, null>

function isProjectOnly(p: LeftPanel) {
  return p === 'git' || p === 'docker' || p === 'mobile' || p === 'graphify'
}

function useProjectClosedNavFallback(initial: NonNullLeftPanel) {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(initial)
  const lastLeftPanelRef = useRef<NonNullLeftPanel>(initial)

  useEffect(() => {
    if (leftPanel !== null) lastLeftPanelRef.current = leftPanel
  }, [leftPanel])

  useEffect(() => {
    if (projectRoot) return
    if (isProjectOnly(lastLeftPanelRef.current)) lastLeftPanelRef.current = 'files'
    setLeftPanel((p) => (isProjectOnly(p) ? 'files' : p))
  }, [projectRoot])

  return { leftPanel, setLeftPanel, lastLeftPanelRef }
}

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/proj' } as any)
})

describe('App — project-closed sidebar fallback', () => {
  it('falls back to Explorer when the project closes while a project-only panel is open', () => {
    const { result } = renderHook(() => useProjectClosedNavFallback('git'))
    expect(result.current.leftPanel).toBe('git')

    act(() => {
      useFileStore.setState({ projectRoot: null } as any)
    })

    expect(result.current.leftPanel).toBe('files')
  })

  it('leaves a project-independent panel (Todos) alone when the project closes', () => {
    const { result } = renderHook(() => useProjectClosedNavFallback('todos'))

    act(() => {
      useFileStore.setState({ projectRoot: null } as any)
    })

    expect(result.current.leftPanel).toBe('todos')
  })

  it('leaves the sidebar closed (rather than reopening it) when the project closes', () => {
    const { result } = renderHook(() => useProjectClosedNavFallback('git'))
    act(() => {
      result.current.setLeftPanel(null)
    })

    act(() => {
      useFileStore.setState({ projectRoot: null } as any)
    })

    expect(result.current.leftPanel).toBeNull()
  })

  it('keeps lastLeftPanelRef in sync so a later reopen restores Explorer, not a hidden panel', () => {
    const { result } = renderHook(() => useProjectClosedNavFallback('git'))
    // Sidebar closed while Git was last active — lastLeftPanelRef still 'git'.
    act(() => {
      result.current.setLeftPanel(null)
    })
    expect(result.current.lastLeftPanelRef.current).toBe('git')

    act(() => {
      useFileStore.setState({ projectRoot: null } as any)
    })

    expect(result.current.lastLeftPanelRef.current).toBe('files')
  })
})
