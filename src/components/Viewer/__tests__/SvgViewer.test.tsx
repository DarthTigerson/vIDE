import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { SvgViewer } from '../SvgViewer'
import { useEditorStore } from '@/stores/editorStore'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

beforeEach(() => {
  ;(global as any).window.api = { readFile: vi.fn(async () => SVG) }
  useEditorStore.setState({ tabs: [] } as never)
})

afterEach(() => cleanup())

describe('SvgViewer', () => {
  it('renders the file through an <img> data url, never inline in the DOM', async () => {
    const { container } = render(<SvgViewer path="/proj/logo.svg" />)
    const img = await waitFor(() => screen.getByAltText('logo.svg') as HTMLImageElement)
    expect(img.src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(container.querySelector('svg, script')).toBeNull()
  })

  it('follows the unsaved buffer of the file’s editor tab', async () => {
    useEditorStore.setState({ tabs: [{ path: '/proj/logo.svg', content: '<svg id="a"/>', dirty: true }] } as never)
    render(<SvgViewer path="/proj/logo.svg" />)
    const img = screen.getByAltText('logo.svg') as HTMLImageElement
    expect(decodeURIComponent(img.src)).toContain('<svg id="a"/>')
    expect((window as any).api.readFile).not.toHaveBeenCalled()
    act(() => {
      useEditorStore.setState({ tabs: [{ path: '/proj/logo.svg', content: '<svg id="b"/>', dirty: true }] } as never)
    })
    expect(decodeURIComponent((screen.getByAltText('logo.svg') as HTMLImageElement).src)).toContain('<svg id="b"/>')
  })

  it('says so when the file cannot be loaded', async () => {
    ;(window as any).api.readFile = vi.fn(async () => { throw new Error('nope') })
    render(<SvgViewer path="/proj/missing.svg" />)
    await waitFor(() => expect(screen.getByText(/Couldn't load missing.svg/)).toBeTruthy())
  })
})
