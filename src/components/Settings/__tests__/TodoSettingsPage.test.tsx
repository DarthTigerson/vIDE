/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TodoSettingsPage } from '../TodoSettingsPage'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'

afterEach(() => {
  cleanup()
  useTodoSettingsStore.setState({ enabled: true })
})

describe('TodoSettingsPage', () => {
  it('renders the Enable To Do toggle on by default', () => {
    render(<TodoSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Enable To Do' })
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking the toggle disables To Do in the store', () => {
    render(<TodoSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable To Do' }))
    expect(useTodoSettingsStore.getState().enabled).toBe(false)
  })
})
