/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FontSection } from '../FontSection'
import { useDisplayStore } from '@/stores/displayStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'

afterEach(() => {
  cleanup()
  useDisplayStore.setState({ font: 'Menlo, monospace' })
  useFontSizeStore.setState({ fontSize: 13 })
})

describe('FontSection', () => {
  it('renders a card per font preset with a sample styled in that font', () => {
    render(<FontSection />)
    expect(screen.getByText('Menlo')).toBeInTheDocument()
    expect(screen.getByText('Monaco')).toBeInTheDocument()
    expect(screen.getByText('Consolas')).toBeInTheDocument()
    expect(screen.getByText('Courier New')).toBeInTheDocument()

    const samples = screen.getAllByText('Aa Bb 123')
    expect(samples).toHaveLength(4)
    expect(samples[0]).toHaveStyle({ fontFamily: 'Menlo, monospace' })
  })

  it('marks the active font preset', () => {
    useDisplayStore.setState({ font: 'Monaco, monospace' })
    render(<FontSection />)
    expect(screen.getByText('Monaco').closest('button')).toHaveClass('border-accent')
    expect(screen.getByText('Menlo').closest('button')).not.toHaveClass('border-accent')
  })

  it('clicking a font card sets the font', () => {
    render(<FontSection />)
    fireEvent.click(screen.getByText('Consolas'))
    expect(useDisplayStore.getState().font).toBe('Consolas, monospace')
  })

  it('shows the current global font size and adjusts it', () => {
    render(<FontSection />)
    expect(screen.getByRole('button', { name: 'Reset font size' })).toHaveTextContent('13')
    fireEvent.click(screen.getByRole('button', { name: 'Increase font size' }))
    expect(useFontSizeStore.getState().fontSize).toBe(14)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }))
    expect(useFontSizeStore.getState().fontSize).toBe(12)
  })

  it('resets the font size to the default', () => {
    useFontSizeStore.getState().increase()
    useFontSizeStore.getState().increase()
    render(<FontSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset font size' }))
    expect(useFontSizeStore.getState().fontSize).toBe(13)
  })
})
