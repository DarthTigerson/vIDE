/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AttachmentThumbnails } from '../AttachmentThumbnails'

afterEach(() => {
  cleanup()
})

function mockApi(overrides: Partial<typeof window.api> = {}) {
  ;(global as any).window.api = {
    todosReadAttachmentDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
    ...overrides,
  }
}

describe('AttachmentThumbnails', () => {
  it('renders nothing when there are no attachments', () => {
    mockApi()
    const { container } = render(<AttachmentThumbnails attachments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('loads and renders each attachment as an image', async () => {
    mockApi({
      todosReadAttachmentDataUrl: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(`data:image/png;base64,${id}`)
      ),
    })
    render(<AttachmentThumbnails attachments={['a1', 'a2']} />)

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(2)
    })
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'data:image/png;base64,a1')
  })

  it('calls onRemove with the attachment id when its remove button is clicked', async () => {
    mockApi()
    const onRemove = vi.fn()
    render(<AttachmentThumbnails attachments={['a1']} onRemove={onRemove} />)

    await waitFor(() => screen.getByRole('img'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }))

    expect(onRemove).toHaveBeenCalledWith('a1')
  })
})
