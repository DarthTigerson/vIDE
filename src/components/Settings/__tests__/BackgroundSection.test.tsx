/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { BackgroundSection } from '../BackgroundSection'
import { useDisplayStore } from '@/stores/displayStore'

afterEach(() => {
  cleanup()
  useDisplayStore.setState({ backgroundImage: 'none' })
})

describe('BackgroundSection', () => {
  it('renders a card for every background option, including the two new ones', () => {
    render(<BackgroundSection />)
    expect(screen.getByText('None')).toBeInTheDocument()
    expect(screen.getByText('vIDE')).toBeInTheDocument()
    expect(screen.getByText('Clawd')).toBeInTheDocument()
    expect(screen.getByText('Atreus')).toBeInTheDocument()
    expect(screen.getByText('Link')).toBeInTheDocument()
  })

  it('marks the active background option', () => {
    useDisplayStore.setState({ backgroundImage: 'atreus' })
    render(<BackgroundSection />)
    expect(screen.getByText('Atreus').closest('button')).toHaveClass('border-accent')
    expect(screen.getByText('Link').closest('button')).not.toHaveClass('border-accent')
  })

  it('clicking a card sets the background image', () => {
    render(<BackgroundSection />)
    fireEvent.click(screen.getByText('Link'))
    expect(useDisplayStore.getState().backgroundImage).toBe('link')
  })

  it('does not render a preview image for the None card', () => {
    render(<BackgroundSection />)
    const noneCard = screen.getByText('None').closest('button')!
    expect(noneCard.querySelector('[style*="background-image"]')).toBeNull()
  })

  it('renders a preview image for a real background option', () => {
    render(<BackgroundSection />)
    const videCard = screen.getByText('vIDE').closest('button')!
    expect(videCard.querySelector('[style*="background-image"]')).not.toBeNull()
  })
})
