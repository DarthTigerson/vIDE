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
import { useExtensionsStore } from '@/stores/extensionsStore'

beforeEach(() => {
  useExtensionsStore.setState({
    enabled: { 'image-viewer': true },
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
