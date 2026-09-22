/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EditorColorsSection } from '../EditorColorsSection'
import { useDisplayStore } from '@/stores/displayStore'
import { useThemeStore } from '@/stores/themeStore'

afterEach(() => {
  cleanup()
  useDisplayStore.setState({ editorColorScheme: 'default' })
  useDisplayStore.getState().resetEditorTokenColors()
  useThemeStore.setState({ theme: 'claude-dark' })
})

describe('EditorColorsSection', () => {
  it('renders a card for Default, Theme Colour Match, High Contrast (Mario Mode), and Custom', () => {
    render(<EditorColorsSection />)
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByText('Theme Colour Match')).toBeInTheDocument()
    expect(screen.getByText('High Contrast (Mario Mode)')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
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
  it('only shows the syntax colour pickers while Custom is the active scheme', () => {
    render(<EditorColorsSection />)
    expect(screen.queryByText('Syntax colors')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Custom'))
    expect(useDisplayStore.getState().editorColorScheme).toBe('custom')
    expect(screen.getByText('Syntax colors')).toBeInTheDocument()
    // "Type / key" is the one that paints a YAML key — the whole reason
    // this scheme exists.
    expect(screen.getByText('Type / key')).toBeInTheDocument()
  })

  it('editing a hex field stores that token colour and repaints the preview', () => {
    useDisplayStore.setState({ editorColorScheme: 'custom' })
    render(<EditorColorsSection />)
    const field = screen.getByTitle('Pick Type / key colour').parentElement!.querySelector('input')!
    fireEvent.change(field, { target: { value: '#ff8800' } })
    fireEvent.blur(field)
    expect(useDisplayStore.getState().editorTokenColors.type).toBe('#ff8800')

    const preview = screen.getByText('Custom').closest('button')!.querySelector('pre')!
    const typeSpan = [...preview.querySelectorAll('span')].find((el) => el.textContent === 'number[]')!
    expect(typeSpan.style.color).toBe('rgb(255, 136, 0)')
  })

  it('rejects an invalid hex instead of storing it', () => {
    useDisplayStore.setState({ editorColorScheme: 'custom' })
    render(<EditorColorsSection />)
    const before = useDisplayStore.getState().editorTokenColors.type
    const field = screen.getByTitle('Pick Type / key colour').parentElement!.querySelector('input')!
    fireEvent.change(field, { target: { value: 'chartreuse' } })
    fireEvent.blur(field)
    expect(useDisplayStore.getState().editorTokenColors.type).toBe(before)
  })
})
