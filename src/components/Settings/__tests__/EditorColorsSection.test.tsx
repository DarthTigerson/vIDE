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
  it('renders a card for Default, High Contrast, and Mario Mode', () => {
    render(<EditorColorsSection />)
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByText('High Contrast')).toBeInTheDocument()
    expect(screen.getByText('Mario Mode')).toBeInTheDocument()
  })

  it('marks the active scheme', () => {
    useDisplayStore.setState({ editorColorScheme: 'high-contrast' })
    render(<EditorColorsSection />)
    expect(screen.getByText('High Contrast').closest('button')).toHaveClass('border-accent')
    expect(screen.getByText('Default').closest('button')).not.toHaveClass('border-accent')
  })

  it('clicking a card sets the editor color scheme', () => {
    render(<EditorColorsSection />)
    fireEvent.click(screen.getByText('High Contrast'))
    expect(useDisplayStore.getState().editorColorScheme).toBe('high-contrast')
  })

  it('previews use the active theme colors, and differ between schemes', () => {
    useThemeStore.setState({ theme: 'borahae-dark' })
    render(<EditorColorsSection />)
    const defaultPreview = screen.getByText('Default').closest('button')!.querySelector('pre')!
    const hcPreview = screen.getByText('High Contrast').closest('button')!.querySelector('pre')!
    // Both previews share the theme's own background...
    expect(defaultPreview).toHaveStyle({ background: '#1b1728' })
    expect(hcPreview).toHaveStyle({ background: '#1b1728' })
    // ...but High Contrast's comment color is distinct from Default's stock one.
    const defaultComment = defaultPreview.querySelector('span')!
    const hcComment = hcPreview.querySelector('span')!
    expect(defaultComment.textContent).toBe('// tidy')
    expect(hcComment.textContent).toBe('// tidy')
    expect(hcComment.style.color).not.toBe(defaultComment.style.color)
  })

  it('Mario Mode ignores the active theme — always the same fixed black background', () => {
    useThemeStore.setState({ theme: 'borahae-dark' })
    render(<EditorColorsSection />)
    const marioPreview = screen.getByText('Mario Mode').closest('button')!.querySelector('pre')!
    expect(marioPreview).toHaveStyle({ background: '#000000' })

    cleanup()
    useThemeStore.setState({ theme: 'atreus-light' })
    render(<EditorColorsSection />)
    const marioPreviewOtherTheme = screen.getByText('Mario Mode').closest('button')!.querySelector('pre')!
    expect(marioPreviewOtherTheme).toHaveStyle({ background: '#000000' })
  })

  it('clicking Mario Mode sets the editor color scheme', () => {
    render(<EditorColorsSection />)
    fireEvent.click(screen.getByText('Mario Mode'))
    expect(useDisplayStore.getState().editorColorScheme).toBe('mario-mode')
  })
})
