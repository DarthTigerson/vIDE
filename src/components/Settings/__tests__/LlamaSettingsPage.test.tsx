/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LlamaSettingsPage } from '../LlamaSettingsPage'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'

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
})
