/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DisplayPage } from '../DisplayPage'
import { useDisplayStore } from '@/stores/displayStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'

afterEach(() => {
  cleanup()
  useDisplayStore.setState({ memoryUsageVisible: true, batteryVisible: true, navbarPosition: 'left' })
  useBottomTerminalStore.getState().reset()
})

describe('DisplayPage — feature blocks', () => {
  it('lays the page out as blocks, pickers first', () => {
    render(<DisplayPage />)
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Theme', 'Panel Style', 'Font', 'Editor Colors', 'Background', 'Title bar', 'Navbar on the right', 'Bottom terminal',
    ])
  })

  it('previews the memory pill only while it is shown', () => {
    useDisplayStore.setState({ memoryUsageVisible: true })
    const { rerender } = render(<DisplayPage />)
    expect(screen.getByTestId('memory-preview-pill')).toBeInTheDocument()
    useDisplayStore.setState({ memoryUsageVisible: false })
    rerender(<DisplayPage />)
    expect(screen.queryByTestId('memory-preview-pill')).toBeNull()
  })

  it('previews the battery only while it is shown, and its switch hides it', () => {
    render(<DisplayPage />)
    expect(screen.getByTestId('battery-preview-pill')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Battery' }))
    expect(useDisplayStore.getState().batteryVisible).toBe(false)
    expect(screen.queryByTestId('battery-preview-pill')).toBeNull()
  })

  it('previews which side the navbar sits on, and the block switch moves it', () => {
    render(<DisplayPage />)
    expect(screen.getByTestId('navbar-preview').querySelector('[data-side]')).toHaveAttribute('data-side', 'left')
    fireEvent.click(screen.getByRole('switch', { name: 'Navbar on the right' }))
    expect(useDisplayStore.getState().navbarPosition).toBe('right')
    expect(screen.getByTestId('navbar-preview').querySelector('[data-side]')).toHaveAttribute('data-side', 'right')
  })

  it('switches the bottom terminal and previews it', () => {
    render(<DisplayPage />)
    expect(screen.getByTestId('bottom-terminal-preview').querySelector('[data-on]')).toHaveAttribute('data-on', 'false')
    fireEvent.click(screen.getByRole('switch', { name: 'Bottom terminal' }))
    expect(useBottomTerminalStore.getState().enabled).toBe(true)
    expect(screen.getByTestId('bottom-terminal-preview').querySelector('[data-on]')).toHaveAttribute('data-on', 'true')
  })
})
