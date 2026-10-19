/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { LlamaSettingsPage } from '../LlamaSettingsPage'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'

let api: Record<string, ReturnType<typeof vi.fn>>
let progress: ((received: number, total: number) => void) | null
beforeEach(() => {
  progress = null
  api = {
    llamaGetInstall: vi.fn().mockResolvedValue({ path: null, source: null, downloadBytes: 12249245 }),
    llamaInstall: vi.fn().mockResolvedValue({ ok: true, path: '/data/llama-server' }),
    onLlamaInstallProgress: vi.fn((cb) => { progress = cb; return () => {} }),
  }
  ;(window as any).api = api
})

afterEach(() => {
  cleanup()
  useLlamaSettingsStore.setState({ enabled: true })
})

describe('LlamaSettingsPage', () => {
  it('renders the Enable Llama toggle on by default', () => {
    render(<LlamaSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Enable Llama' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking the toggle disables Llama in the store', () => {
    render(<LlamaSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Llama' }))
    expect(useLlamaSettingsStore.getState().enabled).toBe(false)
  })

  it('shows where llama.cpp was found', async () => {
    api.llamaGetInstall.mockResolvedValue({ path: '/opt/homebrew/bin/llama-server', source: 'system', downloadBytes: 12249245 })
    render(<LlamaSettingsPage />)
    expect(await screen.findByText('/opt/homebrew/bin/llama-server')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install llama.cpp/ })).toBeNull()
  })

  it('installs llama.cpp with one click when it is missing', async () => {
    useLlamaStore.setState({ available: false })
    let finish!: (v: unknown) => void
    api.llamaInstall.mockReturnValue(new Promise((r) => { finish = r }))
    render(<LlamaSettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install llama.cpp (12 MB)' }))
    expect(api.llamaInstall).toHaveBeenCalled()
    await waitFor(() => expect(progress).not.toBeNull())
    progress!(6, 12)
    expect(await screen.findByText('Installing… 50%')).toBeInTheDocument()
    api.llamaGetInstall.mockResolvedValue({ path: '/data/llama-server', source: 'vide', downloadBytes: 12249245 })
    finish({ ok: true, path: '/data/llama-server' })
    expect(await screen.findByText('/data/llama-server')).toBeInTheDocument()
    // The Llama panel stops showing "llama.cpp isn't installed".
    expect(useLlamaStore.getState().available).toBe(true)
  })

  it('shows the error and lets you retry', async () => {
    api.llamaInstall.mockResolvedValue({ ok: false, error: 'Download failed: HTTP 404' })
    render(<LlamaSettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install llama.cpp (12 MB)' }))
    expect(await screen.findByText('Download failed: HTTP 404')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
