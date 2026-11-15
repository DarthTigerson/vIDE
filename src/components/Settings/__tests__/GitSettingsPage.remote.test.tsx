/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GitSettingsPage } from '../GitSettingsPage'
import { useGitRemoteSettingsStore } from '@/stores/gitRemoteSettingsStore'
import { useFileStore } from '@/stores/fileStore'

beforeEach(() => {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    gitBranches: vi.fn().mockResolvedValue([]),
  }
  useFileStore.setState({ projectRoot: null })
})

afterEach(() => {
  cleanup()
  useGitRemoteSettingsStore.setState({ closeSidePanelOnOpen: false })
})

describe('GitSettingsPage — Git Remote section', () => {
  it('has no URL fields: the address comes from each repo\'s git remote', () => {
    useFileStore.setState({ projectRoot: null })
    render(<GitSettingsPage />)
    expect(screen.queryByLabelText('Default URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText("This project's URL")).not.toBeInTheDocument()
  })

  it('reflects the current closeSidePanelOnOpen state', () => {
    useGitRemoteSettingsStore.setState({ closeSidePanelOnOpen: true })
    render(<GitSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Close side panel when opening' })).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles closeSidePanelOnOpen on click', () => {
    render(<GitSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Close side panel when opening' }))
    expect(useGitRemoteSettingsStore.getState().closeSidePanelOnOpen).toBe(true)
  })
})
