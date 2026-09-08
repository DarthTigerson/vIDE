/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { ColorPickerPopover } from '../ColorPickerPopover'
import { getRecentColors, addRecentColor } from '@/lib/recentColors'

beforeEach(() => {
  localStorage.clear()
  // jsdom returns an all-zero rect by default — stub a fixed size for both
  // the SV square and the hue slider so pointer-coordinate math is testable.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 20,
    toJSON: () => {},
  } as DOMRect)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setup(value = '#ff0000') {
  const anchorRef = createRef<HTMLButtonElement>()
  const onChange = vi.fn()
  const onClose = vi.fn()
  const { container } = render(
    <>
      <button ref={anchorRef}>anchor</button>
      <ColorPickerPopover anchorRef={anchorRef} value={value} onChange={onChange} onClose={onClose} />
    </>,
  )
  return { container, onChange, onClose }
}

describe('ColorPickerPopover', () => {
  it('renders the current value in the hex field', () => {
    setup('#c4613d')
    expect(screen.getByDisplayValue('#c4613d')).toBeInTheDocument()
  })

  it('committing a valid typed hex value calls onChange', () => {
    const { onChange } = setup('#ff0000')
    const input = screen.getByDisplayValue('#ff0000')
    fireEvent.change(input, { target: { value: '#00ff00' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('#00ff00')
  })

  it('does not call onChange for an invalid typed hex value', () => {
    const { onChange } = setup('#ff0000')
    const input = screen.getByDisplayValue('#ff0000')
    fireEvent.change(input, { target: { value: 'not-a-colour' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('dragging the hue slider calls onChange with a colour of the dragged hue', () => {
    const { onChange } = setup('#ff0000')
    const hueSlider = document.querySelector('[data-testid="hue-slider"]')!
    fireEvent.pointerDown(hueSlider, { clientX: 100, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 10 })
    expect(onChange).toHaveBeenCalled()
    const hex = onChange.mock.calls.at(-1)![0]
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('releasing a drag adds the resulting colour to recent colours', () => {
    setup('#ff0000')
    const hueSlider = document.querySelector('[data-testid="hue-slider"]')!
    fireEvent.pointerDown(hueSlider, { clientX: 100, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 100, clientY: 10 })
    expect(getRecentColors()).toHaveLength(1)
  })

  it('clicking a recent swatch calls onChange with that colour', () => {
    addRecentColor('#123456')
    const { onChange } = setup('#ff0000')
    fireEvent.click(screen.getByTitle('#123456'))
    expect(onChange).toHaveBeenCalledWith('#123456')
  })

  it('pressing Escape calls onClose', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking outside the popover and anchor calls onClose', () => {
    const { onClose } = setup()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})
