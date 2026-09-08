/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CustomThemeEditor } from '../CustomThemeEditor'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '@/stores/customThemeStore'
import { useThemeStore } from '@/stores/themeStore'

function makeTheme(id: string, name = 'Test Theme') {
  return {
    id, name, baseFamily: 'claude',
    light: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#eeeeee'])) as any,
    dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#111111'])) as any,
  }
}

beforeEach(() => {
  useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  useCustomThemeStore.setState({ themes: [makeTheme('t1')], activeId: 't1' })
})

afterEach(() => {
  cleanup()
})

describe('CustomThemeEditor', () => {
  it('renders the theme name and all 9 swatch rows for the current variant', () => {
    render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('Test Theme')).toBeInTheDocument()
    CUSTOM_COLOR_VARS.forEach((def) => {
      expect(screen.getByText(def.label)).toBeInTheDocument()
    })
  })

  it('renaming updates the store live', () => {
    render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
    const nameInput = screen.getByDisplayValue('Test Theme')
    fireEvent.change(nameInput, { target: { value: 'Renamed' } })
    expect(useCustomThemeStore.getState().themes[0].name).toBe('Renamed')
  })

  it('switching to the Light tab shows the light-variant hex values', () => {
    render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(screen.getAllByDisplayValue('#eeeeee').length).toBeGreaterThan(0)
  })

  it('clicking Export copies the theme JSON to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(writeText).toHaveBeenCalled()
    const [json] = writeText.mock.calls[0]
    expect(JSON.parse(json).name).toBe('Test Theme')
  })

  it('clicking Delete theme removes it and closes the editor', () => {
    const onClose = vi.fn()
    render(<CustomThemeEditor themeId="t1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete theme' }))
    expect(useCustomThemeStore.getState().themes).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking Close calls onClose without deleting the theme', () => {
    const onClose = vi.fn()
    render(<CustomThemeEditor themeId="t1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(useCustomThemeStore.getState().themes).toHaveLength(1)
  })

  it('renders nothing (and does not throw) for a theme id that no longer exists', () => {
    const onClose = vi.fn()
    const { container } = render(<CustomThemeEditor themeId="missing" onClose={onClose} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('hex text field validation', () => {
    it('does not update the store while typing an invalid partial hex', () => {
      render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
      const hexInput = screen.getAllByDisplayValue('#111111')[0]
      fireEvent.change(hexInput, { target: { value: '#ee' } })
      expect(useCustomThemeStore.getState().themes[0].dark['--color-accent']).toBe('#111111')
    })

    it('updates the store via setSwatch when a valid hex is typed and the field is blurred', () => {
      render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
      const hexInput = screen.getAllByDisplayValue('#111111')[0]
      fireEvent.change(hexInput, { target: { value: '#ABCDEF' } })
      fireEvent.blur(hexInput)
      expect(useCustomThemeStore.getState().themes[0].dark['--color-accent']).toBe('#abcdef')
    })

    it('pressing Escape after typing an invalid value reverts the displayed value without committing', () => {
      render(<CustomThemeEditor themeId="t1" onClose={vi.fn()} />)
      const hexInput = screen.getAllByDisplayValue('#111111')[0] as HTMLInputElement
      fireEvent.change(hexInput, { target: { value: '#ee' } })
      expect(hexInput.value).toBe('#ee')
      fireEvent.keyDown(hexInput, { key: 'Escape' })
      expect(hexInput.value).toBe('#111111')
      expect(useCustomThemeStore.getState().themes[0].dark['--color-accent']).toBe('#111111')
    })
  })
})
