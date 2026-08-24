/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NotesSettingsPage } from '../NotesSettingsPage'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'

afterEach(() => {
  cleanup()
  useNotesSettingsStore.setState({ enabled: true })
})

describe('NotesSettingsPage', () => {
  it('renders the Enable Notes toggle on by default', () => {
    render(<NotesSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Enable Notes' })
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking the toggle disables Notes in the store', () => {
    render(<NotesSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Notes' }))
    expect(useNotesSettingsStore.getState().enabled).toBe(false)
  })
})
