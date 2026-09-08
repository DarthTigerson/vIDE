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
  it('renders one card per built-in family plus a New Custom Theme card', () => {
    render(<ThemeSection />)
    expect(screen.getByRole('button', { name: /^Claude/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^vIDE/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Claude Dark/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Claude Light/ })).toBeNull()
    expect(screen.getByText('New Custom Theme')).toBeInTheDocument()
  })

  it('renders a Light/System/Dark appearance control reflecting the current state', () => {
    useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
    render(<ThemeSection />)
    const group = screen.getByRole('radiogroup', { name: 'Appearance' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
  })

  it('picking Dark sets the variant and turns off match system, without clearing an active custom theme', () => {
    useThemeStore.setState({ theme: 'claude-light', matchSystem: true })
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    render(<ThemeSection />)
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(useThemeStore.getState().theme).toBe('claude-dark')
    expect(useThemeStore.getState().matchSystem).toBe(false)
    expect(useCustomThemeStore.getState().activeId).toBe(id)
  })

  it('picking System turns on match system without clearing an active custom theme', () => {
    useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    render(<ThemeSection />)
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(useThemeStore.getState().matchSystem).toBe(true)
    expect(useCustomThemeStore.getState().activeId).toBe(id)
  })

  it('renders a separator between the built-in and custom themes', () => {
    render(<ThemeSection />)
    expect(screen.getByText('Custom Themes')).toBeInTheDocument()
  })

  it('clicking New Custom Theme creates it immediately with an auto-numbered name and opens the editor', () => {
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('New Custom Theme'))

    expect(useCustomThemeStore.getState().themes).toHaveLength(1)
    expect(useCustomThemeStore.getState().themes[0].name).toBe('Custom Theme 1')
    // the editor panel opens automatically, showing every colour row
    expect(screen.getByText(CUSTOM_COLOR_VARS[0].label)).toBeInTheDocument()
  })

  it('auto-numbers past existing "Custom Theme N" names instead of colliding', () => {
    useCustomThemeStore.getState().createFromActive('Custom Theme 1')
    useCustomThemeStore.getState().createFromActive('Custom Theme 3')
    render(<ThemeSection />)
    fireEvent.click(screen.getByText('New Custom Theme'))
    expect(useCustomThemeStore.getState().themes.some((t) => t.name === 'Custom Theme 4')).toBe(true)
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
    fireEvent.click(screen.getByRole('button', { name: /^vIDE/ }))
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

  describe('custom theme right-click menu', () => {
    it('right-clicking a custom theme card opens a menu with Edit, Share Theme, and Delete', () => {
      useCustomThemeStore.getState().createFromActive('Sunset')
      render(<ThemeSection />)
      fireEvent.contextMenu(screen.getByText('Sunset'))
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Share Theme' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('Edit activates the theme and opens the editor', () => {
      const id = useCustomThemeStore.getState().createFromActive('Sunset')
      useCustomThemeStore.getState().setActive(null)
      render(<ThemeSection />)
      fireEvent.contextMenu(screen.getByText('Sunset'))
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(useCustomThemeStore.getState().activeId).toBe(id)
      expect(screen.getByText(CUSTOM_COLOR_VARS[0].label)).toBeInTheDocument()
    })

    it('Share Theme copies the exported theme JSON to the clipboard', () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, { clipboard: { writeText } })
      useCustomThemeStore.getState().createFromActive('Sunset')
      render(<ThemeSection />)
      fireEvent.contextMenu(screen.getByText('Sunset'))
      fireEvent.click(screen.getByRole('button', { name: 'Share Theme' }))
      expect(writeText).toHaveBeenCalled()
      expect(JSON.parse(writeText.mock.calls[0][0]).name).toBe('Sunset')
    })

    it('Delete removes the theme', () => {
      useCustomThemeStore.getState().createFromActive('Sunset')
      render(<ThemeSection />)
      fireEvent.contextMenu(screen.getByText('Sunset'))
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(useCustomThemeStore.getState().themes).toHaveLength(0)
    })

    it('does not render a hover edit/delete icon on the card itself', () => {
      useCustomThemeStore.getState().createFromActive('Sunset')
      render(<ThemeSection />)
      expect(screen.queryByTitle(/Edit Sunset/)).toBeNull()
      expect(screen.queryByTitle(/Delete Sunset/)).toBeNull()
    })
  })

  it('never renders a <dialog> or role="dialog" element', () => {
    const { container } = render(<ThemeSection />)
    fireEvent.click(screen.getByText('New Custom Theme'))
    expect(container.querySelector('dialog')).toBeNull()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
