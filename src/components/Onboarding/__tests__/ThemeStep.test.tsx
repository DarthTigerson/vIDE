/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ThemeStep } from '../ThemeStep'
import { useThemeStore } from '@/stores/themeStore'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '@/stores/customThemeStore'
import { useDisplayStore } from '@/stores/displayStore'

beforeEach(() => {
  useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  useCustomThemeStore.setState({
    themes: [{
      id: 't1', name: 'Custom', baseFamily: 'claude',
      light: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#eeeeee'])) as any,
      dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#111111'])) as any,
    }],
    activeId: 't1',
  })
})

afterEach(() => {
  cleanup()
  useDisplayStore.setState(useDisplayStore.getInitialState())
})

describe('ThemeStep — consistency with custom themes', () => {
  it('choosing a colour family clears any active custom theme', () => {
    render(<ThemeStep />)
    fireEvent.click(screen.getByLabelText('Colour family'))
    fireEvent.click(screen.getByRole('option', { name: 'vIDE' }))
    expect(useCustomThemeStore.getState().activeId).toBeNull()
  })

  it('picking Light/Dark directly clears any active custom theme', () => {
    render(<ThemeStep />)
    fireEvent.click(screen.getByRole('button', { name: /Dark$/ }))
    expect(useCustomThemeStore.getState().activeId).toBeNull()
  })

  it('choosing "System" appearance does NOT clear an active custom theme', () => {
    render(<ThemeStep />)
    fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(useCustomThemeStore.getState().activeId).toBe('t1')
  })
})
