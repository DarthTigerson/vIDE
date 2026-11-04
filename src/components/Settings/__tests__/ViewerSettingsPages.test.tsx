/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
})
vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))

import { ImageViewerSettingsPage } from '../ImageViewerSettingsPage'
import { SvgViewerSettingsPage } from '../SvgViewerSettingsPage'
import { useExtensionsStore } from '@/stores/extensionsStore'

beforeEach(() => {
  useExtensionsStore.setState({
    enabled: { 'image-viewer': true, 'svg-viewer': true },
    svgDefaultMode: 'toggle',
    svgModes: {},
  })
})
afterEach(cleanup)

describe('ImageViewerSettingsPage', () => {
  it('has an Enable switch bound to the extension', () => {
    render(<ImageViewerSettingsPage />)
    const sw = screen.getByRole('switch', { name: 'Enable Image viewer' })
    expect(sw).toBeChecked()
    fireEvent.click(sw)
    expect(useExtensionsStore.getState().isEnabled('image-viewer')).toBe(false)
  })
})

describe('SvgViewerSettingsPage', () => {
  it('has an Enable switch bound to the extension', () => {
    render(<SvgViewerSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable SVG viewer' }))
    expect(useExtensionsStore.getState().isEnabled('svg-viewer')).toBe(false)
  })

  it('defaults the view to Toggle and saves a changed default mode', () => {
    render(<SvgViewerSettingsPage />)
    expect(screen.getByRole('radio', { name: 'Toggle' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Split' }))
    expect(useExtensionsStore.getState().svgDefaultMode).toBe('split')
    expect(screen.getByRole('radio', { name: 'Split' })).toHaveAttribute('aria-checked', 'true')
  })
})
