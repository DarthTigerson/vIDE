/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EditorStep } from '../EditorStep'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'

beforeEach(() => {
  localStorage.clear()
  useEditorSettingsStore.setState({ autoSaveEnabled: false })
})

afterEach(() => cleanup())

describe('EditorStep — auto save choice', () => {
  it('starts on Off, matching the store default', () => {
    render(<EditorStep />)
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'false')
  })

  it('picking On turns auto save on, and Off turns it back off', () => {
    render(<EditorStep />)
    fireEvent.click(screen.getByRole('radio', { name: 'On' }))
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(true)
    expect(screen.getByText('Saved automatically a moment after you stop typing.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Off' }))
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(false)
    expect(screen.getByText('Unsaved until you press ⌘S.')).toBeInTheDocument()
  })
})
