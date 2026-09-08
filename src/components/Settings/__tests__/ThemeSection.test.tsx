/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ThemeSection } from '../ThemeSection'
import { useThemeStore } from '@/stores/themeStore'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '@/stores/customThemeStore'

beforeEach(() => {
  useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  useCustomThemeStore.setState({ themes: [], activeId: null })
})

afterEach(() => {
  cleanup()
})

describe('ThemeSection', () => {
  it('renders every built-in theme card plus a New Custom Theme card', () => {
    render(<ThemeSection />)
    expect(screen.getByRole('button', { name: /Claude Dark/ })).toBeInTheDocument()
    expect(screen.getByText('New Custom Theme')).toBeInTheDocument()
  })

  it('creating a custom theme via the inline name field adds it to the grid and opens the editor', () => {
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('New Custom Theme'))
    const input = screen.getByPlaceholderText('Theme name')
    fireEvent.change(input, { target: { value: 'My Theme' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(useCustomThemeStore.getState().themes).toHaveLength(1)
    expect(useCustomThemeStore.getState().themes[0].name).toBe('My Theme')
    // the editor panel opens automatically, showing every colour row
    expect(screen.getByText(CUSTOM_COLOR_VARS[0].label)).toBeInTheDocument()
  })

  it('a custom theme appears as its own card once created', () => {
    render(<ThemeSection />)
    useCustomThemeStore.getState().createFromActive('Sunset')
    render(<ThemeSection />)
    expect(screen.getAllByText('Sunset').length).toBeGreaterThan(0)
  })

  it('clicking a built-in card clears any active custom theme', () => {
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    useCustomThemeStore.getState().setActive(id)
    render(<ThemeSection />)
    fireEvent.click(screen.getByRole('button', { name: /Thomas Dark/ }))
    expect(useCustomThemeStore.getState().activeId).toBeNull()
    expect(useThemeStore.getState().theme).toBe('thomas-dark')
  })

  it('clicking a custom theme card activates it and preserves "match system"', () => {
    useThemeStore.setState({ theme: 'claude-dark', matchSystem: true })
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    useCustomThemeStore.getState().setActive(null)
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('Sunset'))
    expect(useCustomThemeStore.getState().activeId).toBe(id)
    expect(useThemeStore.getState().matchSystem).toBe(true)
  })

  it('importing a valid pasted theme adds it to the grid', () => {
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('Import Theme'))
    const textarea = screen.getByPlaceholderText('Paste exported theme JSON here')
    const json = JSON.stringify({
      name: 'Imported', baseFamily: 'claude',
      light: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#ffffff'])),
      dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#000000'])),
    })
    fireEvent.change(textarea, { target: { value: json } })
    fireEvent.click(screen.getByRole('button', { name: 'Add theme' }))
    expect(useCustomThemeStore.getState().themes.some((t) => t.name === 'Imported')).toBe(true)
  })

  it('shows an inline error for invalid import JSON without throwing', () => {
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('Import Theme'))
    const textarea = screen.getByPlaceholderText('Paste exported theme JSON here')
    fireEvent.change(textarea, { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add theme' }))
    expect(screen.getByText(/Couldn't read that theme/)).toBeInTheDocument()
  })

  it('never renders a <dialog> or role="dialog" element', () => {
    const { container } = render(<ThemeSection />)
    fireEvent.click(screen.getByText('New Custom Theme'))
    expect(container.querySelector('dialog')).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
