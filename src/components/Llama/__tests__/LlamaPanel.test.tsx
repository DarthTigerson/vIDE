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

  it('shows install instructions when llama.cpp is not available', () => {
    useLlamaStore.setState({ available: false })
    render(<LlamaPanel />)
    expect(screen.getByText(/brew install llama.cpp/)).toBeInTheDocument()
  })

  it('the quick-launch button opens a terminal tab and copies the install command', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } })
    useLlamaStore.setState({ available: false })
    render(<LlamaPanel />)

    fireEvent.click(screen.getByRole('button', { name: /open terminal.*copy install command/i }))

    expect(writeTextMock).toHaveBeenCalledWith('brew install llama.cpp')
    expect(openTabMock).toHaveBeenCalledTimes(1)
    expect(openTabMock.mock.calls[0][0].path).toMatch(/^terminal:\/\//)
  })

  it('shows the checking state while availability is still being probed', () => {
    useLlamaStore.setState({ available: null, checking: true })
    render(<LlamaPanel />)
    expect(screen.getByText(/checking for llama\.cpp/i)).toBeInTheDocument()
  })

  it('shows the Create Model button (disabled until the editor page lands) when available', () => {
    useLlamaStore.setState({ available: true })
    render(<LlamaPanel />)
    expect(screen.getByText(/llama\.cpp is installed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create model/i })).toBeDisabled()
  })

  it('calls checkAvailable on mount when availability is unknown', () => {
    const checkAvailable = vi.fn()
    useLlamaStore.setState({ available: null, checking: false, checkAvailable })
    render(<LlamaPanel />)
    expect(checkAvailable).toHaveBeenCalled()
  })
})
