/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { GeneralSettingsPage } from '../GeneralSettingsPage'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { useConfigRepoStore } from '@/stores/configRepoStore'

beforeEach(() => {
  useConfigRepoStore.setState({
    loaded: true, load: vi.fn(), enabled: false, setEnabled: vi.fn(),
    repoUrl: 'https://github.com/thomas/vide-config.git', token: '', status: 'idle',
    categories: { general: true, git: true, notes: false },
  } as never)
  useGeneralSettingsStore.setState({ newTabPane: 'biggest' })
})
afterEach(cleanup)

const block = (name: string) => screen.getByRole('region', { name })

describe('GeneralSettingsPage — feature blocks', () => {
  it('lays the page out as Tabs, Agent panel, vIDE Sync and Setup wizard', () => {
    render(<GeneralSettingsPage />)
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Tabs', 'Agent panel', 'vIDE Sync', 'Setup wizard'])
  })

  it('draws the new tab in the biggest or the active window', () => {
    const { rerender } = render(<GeneralSettingsPage />)
    expect(screen.getByText('notes.md').closest('[data-pane]')).toHaveAttribute('data-pane', 'big')
    useGeneralSettingsStore.setState({ newTabPane: 'active' })
    rerender(<GeneralSettingsPage />)
    expect(screen.getByText('notes.md').closest('[data-pane]')).toHaveAttribute('data-pane', 'focused')
  })

  it('greys out the sync setup while sync is off, and the block switch turns it on', () => {
    render(<GeneralSettingsPage />)
    expect(within(block('vIDE Sync')).getByLabelText('Repository URL')).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'vIDE Sync' }))
    expect(useConfigRepoStore.getState().setEnabled).toHaveBeenCalledWith(true)
  })

  it('previews the repo and which categories sync', () => {
    render(<GeneralSettingsPage />)
    const preview = screen.getByTestId('sync-preview')
    expect(preview).toHaveTextContent('thomas/vide-config')
    expect(within(preview).getByText('Git')).toHaveAttribute('data-on', 'true')
    expect(within(preview).getByText('Notes')).not.toHaveAttribute('data-on')
  })
})
