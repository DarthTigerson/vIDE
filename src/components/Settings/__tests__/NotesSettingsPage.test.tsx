/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = {
    notesMcpEnable: () => Promise.resolve(),
    notesMcpDisable: () => Promise.resolve(),
  }
})

import { NotesSettingsPage } from '../NotesSettingsPage'
import { useNotesSettingsStore } from '@/stores/notesSettingsStore'

beforeEach(() => {
  ;(global as any).window.api = {
    notesMcpEnable: vi.fn().mockResolvedValue(undefined),
    notesMcpDisable: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  cleanup()
  useNotesSettingsStore.setState({ enabled: true, openInBiggestPane: false })
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
