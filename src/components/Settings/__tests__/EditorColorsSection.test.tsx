/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EditorColorsSection } from '../EditorColorsSection'
import { useDisplayStore } from '@/stores/displayStore'
import { useThemeStore } from '@/stores/themeStore'

afterEach(() => {
  cleanup()
  useDisplayStore.setState({ editorColorScheme: 'default' })
  useThemeStore.setState({ theme: 'claude-dark' })
})

describe('EditorColorsSection', () => {
  it('renders a card for Default, Theme Colour Match, and High Contrast (Mario Mode)', () => {
    render(<EditorColorsSection />)
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByText('Theme Colour Match')).toBeInTheDocument()
    expect(screen.getByText('High Contrast (Mario Mode)')).toBeInTheDocument()
  })

  it('marks the active scheme', () => {
    useDisplayStore.setState({ editorColorScheme: 'high-contrast' })
    render(<EditorColorsSection />)
    expect(screen.getByText('Theme Colour Match').closest('button')).toHaveClass('border-accent')
    expect(screen.getByText('Default').closest('button')).not.toHaveClass('border-accent')
  })

  it('clicking a card sets the editor color scheme', () => {
    render(<EditorColorsSection />)
    fireEvent.click(screen.getByText('Theme Colour Match'))
    expect(useDisplayStore.getState().editorColorScheme).toBe('high-contrast')
  })

  it('previews use the active theme colors, and differ between schemes', () => {
    useThemeStore.setState({ theme: 'borahae-dark' })
    render(<EditorColorsSection />)
    const defaultPreview = screen.getByText('Default').closest('button')!.querySelector('pre')!
    const hcPreview = screen.getByText('Theme Colour Match').closest('button')!.querySelector('pre')!
    // Both previews share the theme's own background...
    expect(defaultPreview).toHaveStyle({ background: '#1b1728' })
    expect(hcPreview).toHaveStyle({ background: '#1b1728' })
    // ...but Theme Colour Match's comment color is distinct from Default's stock one.
    const defaultComment = defaultPreview.querySelector('span')!
    const hcComment = hcPreview.querySelector('span')!
    expect(defaultComment.textContent).toBe('// tidy')
    expect(hcComment.textContent).toBe('// tidy')
    expect(hcComment.style.color).not.toBe(defaultComment.style.color)
  })

  it('High Contrast (Mario Mode) ignores the active theme — always the same fixed black background', () => {
    useThemeStore.setState({ theme: 'borahae-dark' })
    render(<EditorColorsSection />)
    const marioPreview = screen.getByText('High Contrast (Mario Mode)').closest('button')!.querySelector('pre')!
    expect(marioPreview).toHaveStyle({ background: '#000000' })

    cleanup()
    useThemeStore.setState({ theme: 'atreus-light' })
    render(<EditorColorsSection />)
    const marioPreviewOtherTheme = screen.getByText('High Contrast (Mario Mode)').closest('button')!.querySelector('pre')!
    expect(marioPreviewOtherTheme).toHaveStyle({ background: '#000000' })
  })

  it('clicking High Contrast (Mario Mode) sets the editor color scheme', () => {
    render(<EditorColorsSection />)
    fireEvent.click(screen.getByText('High Contrast (Mario Mode)'))
    expect(useDisplayStore.getState().editorColorScheme).toBe('mario-mode')
  })
})
