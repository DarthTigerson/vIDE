import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { FontSizeControl } from '../FontSizeControl'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { DISPLAY_TAB_PATH } from '@/components/Settings/paths'

beforeEach(() => {
  act(() => useFontSizeStore.getState().setFontSize(13))
  useEditorStore.setState({ activeTabPath: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FontSizeControl', () => {
  it('shows the current size in a chip', () => {
    render(<FontSizeControl />)
    expect(screen.getByTestId('font-size-chip').textContent).toBe('13')
  })

  it('opens the Display panel, whose link opens Settings > Display', () => {
    render(<FontSizeControl />)
    fireEvent.click(screen.getByTestId('font-size-chip'))
    expect(useEditorStore.getState().activeTabPath).toBeNull()
    fireEvent.click(screen.getByText('Display settings…'))
    expect(useEditorStore.getState().activeTabPath).toBe(DISPLAY_TAB_PATH)
    expect(screen.queryByText('Display settings…')).toBeNull()
  })

  it('steps the font size from the panel', () => {
    render(<FontSizeControl />)
    fireEvent.click(screen.getByTestId('font-size-chip'))
    fireEvent.click(screen.getByRole('button', { name: 'Larger' }))
    expect(useFontSizeStore.getState().fontSize).toBe(14)
    fireEvent.click(screen.getByRole('button', { name: 'Smaller' }))
    fireEvent.click(screen.getByRole('button', { name: 'Smaller' }))
    expect(screen.getByTestId('display-font-size').textContent).toBe('12')
  })

  it('switches the bottom terminal from the panel', () => {
    const setEnabled = vi.spyOn(useBottomTerminalStore.getState(), 'setEnabled').mockImplementation(() => {})
    render(<FontSizeControl />)
    fireEvent.click(screen.getByTestId('font-size-chip'))
    const toggle = screen.getByRole('switch', { name: 'Bottom terminal' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(setEnabled).toHaveBeenCalledWith(true)
    setEnabled.mockRestore()
  })

  it('briefly highlights the chip when the size changes from the menu shortcuts', () => {
    vi.useFakeTimers()
    render(<FontSizeControl />)
    act(() => useFontSizeStore.getState().increase())
    const chip = screen.getByTestId('font-size-chip')
    expect(chip.textContent).toBe('14')
    expect(chip.className).toMatch(/text-accent/)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByTestId('font-size-chip').className).not.toMatch(/text-accent/)
  })
})
