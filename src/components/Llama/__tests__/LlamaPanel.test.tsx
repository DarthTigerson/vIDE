import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LlamaPanel } from '../LlamaPanel'
import { useLlamaStore } from '@/stores/llamaStore'
import { useEditorStore } from '@/stores/editorStore'

const { openTabMock } = vi.hoisted(() => ({ openTabMock: vi.fn() }))

;(global as any).window.api = {
  llamaIsAvailable: vi.fn().mockResolvedValue(true),
}

describe('LlamaPanel', () => {
  beforeEach(() => {
    openTabMock.mockClear()
    useLlamaStore.setState({ available: null, checking: false, checkAvailable: vi.fn() })
    useEditorStore.setState({ openTab: openTabMock })
  })

  it('points to Settings > Llama when llama.cpp is not available', () => {
    useLlamaStore.setState({ available: false })
    render(<LlamaPanel />)
    expect(screen.getByText("llama.cpp isn't installed.")).toBeInTheDocument()
    expect(screen.queryByText(/brew install/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Set up in Settings' }))
    expect(openTabMock).toHaveBeenCalledWith({ path: 'settings://Llama', content: '', dirty: false })
  })

  it('shows the checking state while availability is still being probed', () => {
    useLlamaStore.setState({ available: null, checking: true })
    render(<LlamaPanel />)
    expect(screen.getByText(/checking for llama\.cpp/i)).toBeInTheDocument()
  })

  it('opens the create model page when Create Model is clicked', () => {
    useLlamaStore.setState({ available: true })
    render(<LlamaPanel />)
    const button = screen.getByRole('button', { name: /create model/i })
    expect(button).toBeEnabled()

    fireEvent.click(button)

    expect(openTabMock).toHaveBeenCalledTimes(1)
    expect(openTabMock.mock.calls[0][0].path).toBe('llama-model://new')
  })

  it('calls checkAvailable on mount when availability is unknown', () => {
    const checkAvailable = vi.fn()
    useLlamaStore.setState({ available: null, checking: false, checkAvailable })
    render(<LlamaPanel />)
    expect(checkAvailable).toHaveBeenCalled()
  })
})
