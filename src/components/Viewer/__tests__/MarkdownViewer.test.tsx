import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MarkdownViewer } from '../MarkdownViewer'
import { useEditorStore } from '@/stores/editorStore'

beforeEach(() => {
  ;(global as any).window.api = {
    readFile: vi.fn(async () => '# Hello\n\nSome **bold** text.'),
  }
  useEditorStore.setState({ tabs: [] })
})

afterEach(() => {
  cleanup()
})

describe('MarkdownViewer', () => {
  it('renders markdown content as HTML', async () => {
    render(<MarkdownViewer path="/proj/README.md" />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy())
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('shows an error message when the file fails to load', async () => {
    ;(window as any).api.readFile = vi.fn(async () => {
      throw new Error('nope')
    })
    render(<MarkdownViewer path="/proj/README.md" />)
    await waitFor(() => expect(screen.getByText(/Couldn't load README.md/)).toBeTruthy())
  })

  it('renders the open editor tab\'s live content instead of reading the file from disk (VIDE regression: preview needed a close/reopen to reflect edits)', async () => {
    useEditorStore.setState({
      tabs: [{ path: '/proj/README.md', content: '# Live\n\nFrom the editor tab.', dirty: true }],
    })
    render(<MarkdownViewer path="/proj/README.md" />)

    expect(await screen.findByRole('heading', { name: 'Live' })).toBeTruthy()
    expect(window.api.readFile).not.toHaveBeenCalled()
  })

  it('updates live as the editor tab\'s content changes, without remounting', async () => {
    useEditorStore.setState({
      tabs: [{ path: '/proj/README.md', content: '# First', dirty: true }],
    })
    render(<MarkdownViewer path="/proj/README.md" />)
    expect(await screen.findByRole('heading', { name: 'First' })).toBeTruthy()

    useEditorStore.getState().updateContent('/proj/README.md', '# Second')

    expect(await screen.findByRole('heading', { name: 'Second' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'First' })).toBeNull()
  })

  it('falls back to reading the file from disk when no editor tab is open for it (e.g. Notes/Graphify preview-only tabs)', async () => {
    render(<MarkdownViewer path="/proj/README.md" />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hello' })).toBeTruthy())
    expect(window.api.readFile).toHaveBeenCalledWith('/proj/README.md')
  })
})
