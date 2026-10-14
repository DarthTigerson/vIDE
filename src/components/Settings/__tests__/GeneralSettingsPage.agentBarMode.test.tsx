/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GeneralSettingsPage } from '../GeneralSettingsPage'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { useConfigRepoStore } from '@/stores/configRepoStore'

beforeEach(() => {
  useConfigRepoStore.setState({ loaded: true, load: vi.fn() } as never)
  useGeneralSettingsStore.setState({ agentBarMode: 'collapse' })
})
afterEach(cleanup)

describe('GeneralSettingsPage — Agent panel session names', () => {
  it('defaults to click to collapse', () => {
    render(<GeneralSettingsPage />)
    expect(screen.getByRole('radio', { name: 'Click to collapse' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/grip on the bar's inner edge/)).toBeInTheDocument()
    expect(screen.getByTestId('agent-bar-preview').querySelector('[data-mode]')).toHaveAttribute('data-mode', 'collapse')
  })

  it('switches to expand on hover and explains that instead', () => {
    render(<GeneralSettingsPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'Expand on hover' }))
    expect(useGeneralSettingsStore.getState().agentBarMode).toBe('hover')
    expect(localStorage.getItem('vide:general:agentBarMode')).toBe('hover')
    expect(screen.getByText(/widens over the panel while you hover/)).toBeInTheDocument()
    expect(screen.getByTestId('agent-bar-preview').querySelector('[data-mode]')).toHaveAttribute('data-mode', 'hover')
  })
})
