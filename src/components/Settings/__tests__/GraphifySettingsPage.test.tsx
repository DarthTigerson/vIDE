import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GraphifySettingsPage } from '../GraphifySettingsPage'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'

let api: Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => {
  api = {
    graphifyGetInstall: vi.fn().mockResolvedValue({ path: null, source: null, downloadBytes: null }),
    graphifyInstall: vi.fn().mockResolvedValue({ ok: true, path: '/Users/t/.local/bin/graphify' }),
    onGraphifyInstallProgress: vi.fn(() => () => {}),
  }
  ;(window as any).api = api
})

describe('GraphifySettingsPage', () => {
  beforeEach(() => {
    useGraphifySettingsStore.setState({ autoBuildOnOpen: false, gitignorePrompt: true, claudeSkillPrompt: true })
  })

  it('turns the Claude Code setup reminder off', () => {
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Remind to set up graphify for Claude Code' }))
    expect(useGraphifySettingsStore.getState().claudeSkillPrompt).toBe(false)
  })

  it('turns the gitignore reminder off', () => {
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Remind to gitignore graphify-out' }))
    expect(useGraphifySettingsStore.getState().gitignorePrompt).toBe(false)
  })

  it('auto-build-on-open toggle is off by default and shows no resource warning', () => {
    render(<GraphifySettingsPage />)
    const toggle = screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText(/spawns a real CLI process/)).not.toBeInTheDocument()
  })

  it('turning on auto-build-on-open shows a resource-usage warning', () => {
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i }))

    expect(useGraphifySettingsStore.getState().autoBuildOnOpen).toBe(true)
    expect(screen.getByText(/spawns a real CLI process/)).toBeInTheDocument()
  })

  it('turning auto-build-on-open back off hides the warning', () => {
    useGraphifySettingsStore.setState({ autoBuildOnOpen: true })
    render(<GraphifySettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /auto-build graph when a repo is opened/i }))

    expect(useGraphifySettingsStore.getState().autoBuildOnOpen).toBe(false)
    expect(screen.queryByText(/spawns a real CLI process/)).not.toBeInTheDocument()
  })

  it('shows where graphify was found', async () => {
    api.graphifyGetInstall.mockResolvedValue({ path: '/Users/t/.local/bin/graphify', source: 'system', downloadBytes: null })
    render(<GraphifySettingsPage />)
    expect(await screen.findByText('/Users/t/.local/bin/graphify')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install graphify/ })).toBeNull()
  })

  it('installs graphify with one click when it is missing', async () => {
    useGraphifyStore.setState({ available: false })
    render(<GraphifySettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install graphify' }))
    api.graphifyGetInstall.mockResolvedValue({ path: '/Users/t/.local/bin/graphify', source: 'system', downloadBytes: null })
    expect(await screen.findByText('/Users/t/.local/bin/graphify')).toBeInTheDocument()
    expect(api.graphifyInstall).toHaveBeenCalled()
    await waitFor(() => expect(useGraphifyStore.getState().available).toBe(true))
  })

  it('shows the error and lets you retry', async () => {
    api.graphifyInstall.mockResolvedValue({ ok: false, error: 'uv: network unreachable' })
    render(<GraphifySettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Install graphify' }))
    expect(await screen.findByText('uv: network unreachable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
