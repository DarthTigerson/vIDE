import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { ImageViewer } from '../ImageViewer'

beforeEach(() => {
  ;(global as any).window.api = {
    readImageDataUrl: vi.fn(async (path: string) => `data:image/png;base64,${path.length}`),
    readImagePngDataUrl: vi.fn(async () => 'data:image/png;base64,CONVERTED'),
  }
})

afterEach(() => {
  cleanup()
})

describe('ImageViewer', () => {
  it('loads and renders the image from a data url', async () => {
    render(<ImageViewer path="/proj/assets/logo.png" />)
    const img = await waitFor(() => screen.getByAltText('logo.png') as HTMLImageElement)
    expect(img.src).toContain('data:image/png;base64,')
    expect(screen.getByText('logo.png')).toBeTruthy()
  })

  it('shows an error message when the image fails to load', async () => {
    ;(window as any).api.readImageDataUrl = vi.fn(async () => {
      throw new Error('nope')
    })
    render(<ImageViewer path="/proj/assets/missing.png" />)
    await waitFor(() => expect(screen.getByText(/Couldn't load missing.png/)).toBeTruthy())
  })

  it('converts TIFF and HEIC through the main process instead of loading them directly', async () => {
    render(<ImageViewer path="/proj/scan.tiff" />)
    const img = await waitFor(() => screen.getByAltText('scan.tiff') as HTMLImageElement)
    expect(img.src).toBe('data:image/png;base64,CONVERTED')
    expect((window as any).api.readImagePngDataUrl).toHaveBeenCalledWith('/proj/scan.tiff')
    expect((window as any).api.readImageDataUrl).not.toHaveBeenCalled()
  })

  it('says the preview is not available when the system could not decode the format', async () => {
    ;(window as any).api.readImagePngDataUrl = vi.fn(async () => '')
    render(<ImageViewer path="/proj/photo.heic" />)
    await waitFor(() =>
      expect(screen.getByText('Preview not available for this format on this system')).toBeTruthy()
    )
    expect(screen.queryByRole('img')).toBeNull()
  })
})
