/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { GitSettingsPage } from '../GitSettingsPage'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { useFileStore } from '@/stores/fileStore'

beforeEach(() => {
  ;(global as any).window.api = { ...(global as any).window.api, gitBranches: vi.fn().mockResolvedValue([]) }
  useFileStore.setState({ projectRoot: null })
  useGitSettingsStore.setState({ forceSafetyEnabled: true, countdownEnabled: false })
})
afterEach(cleanup)

const block = (name: string) => screen.getByRole('region', { name })

describe('GitSettingsPage — feature blocks', () => {
  it('lays the page out as the seven blocks, in order', () => {
    render(<GitSettingsPage />)
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(names).toEqual([
      'Blame', 'Inline diff', 'Force push safety', 'Git Log', 'Background fetch', 'Multi-repo', 'Graph & List Diff',
    ])
  })

  it('gives every block but Multi-repo a preview', () => {
    render(<GitSettingsPage />)
    for (const id of ['blame-preview', 'inline-diff-preview', 'force-push-preview', 'git-log-preview', 'fetch-preview', 'graph-tabs-preview']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    expect(block('Multi-repo').querySelector('[data-preview]')).toBeNull()
  })

  it('dims the countdown length until the countdown is on', () => {
    render(<GitSettingsPage />)
    const force = block('Force push safety')
    expect(within(force).getByLabelText('Countdown length')).toBeDisabled()
    fireEvent.click(within(force).getByRole('switch', { name: 'Countdown before confirming' }))
    expect(useGitSettingsStore.getState().countdownEnabled).toBe(true)
  })

  it('turns force-push safety off and back on from the block switch', () => {
    render(<GitSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Force push safety' }))
    expect(useGitSettingsStore.getState().forceSafetyEnabled).toBe(false)
    expect(within(block('Force push safety')).getByRole('switch', { name: 'Countdown before confirming' })).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Force push safety' }))
    expect(useGitSettingsStore.getState().forceSafetyEnabled).toBe(true)
  })
})
