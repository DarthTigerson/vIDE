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

const manual = () => screen.getByRole('radio', { name: /Save when I press/ })
const auto = () => screen.getByRole('radio', { name: /Save automatically/ })

describe('EditorStep — auto save choice', () => {
  it('starts on manual save, matching the store default', () => {
    render(<EditorStep />)
    expect(manual()).toHaveAttribute('aria-checked', 'true')
    expect(auto()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('autosave-demo')).toHaveTextContent('Unsaved changes')
  })

  it('reflects an existing user choice instead of overwriting it', () => {
    useEditorSettingsStore.setState({ autoSaveEnabled: true })
    render(<EditorStep />)
    expect(auto()).toHaveAttribute('aria-checked', 'true')
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(true)
  })

  it('picking an option sets auto save and switches the demo', () => {
    render(<EditorStep />)
    fireEvent.click(auto())
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(true)
    expect(screen.getByTestId('autosave-demo')).toHaveTextContent('Saved')

    fireEvent.click(manual())
    expect(useEditorSettingsStore.getState().autoSaveEnabled).toBe(false)
    expect(screen.getByTestId('autosave-demo')).toHaveTextContent('Unsaved changes')
  })
})
