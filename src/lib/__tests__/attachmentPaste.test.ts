import { describe, it, expect } from 'vitest'
import { extractPastedImageFiles } from '../attachmentPaste'

function fakeItem(kind: string, type: string, file: unknown): DataTransferItem {
  return { kind, type, getAsFile: () => file } as unknown as DataTransferItem
}

describe('extractPastedImageFiles', () => {
  it('returns an empty array when clipboardData is null', () => {
    expect(extractPastedImageFiles(null)).toEqual([])
  })

  it('picks out only file items whose type starts with image/', () => {
    const imageFile = { name: 'shot.png' }
    const items = [
      fakeItem('string', 'text/plain', null),
      fakeItem('file', 'image/png', imageFile),
      fakeItem('file', 'application/pdf', { name: 'doc.pdf' }),
    ]
    const clipboardData = { items } as unknown as DataTransfer

    expect(extractPastedImageFiles(clipboardData)).toEqual([imageFile])
  })

  it('drops file items whose getAsFile() returns null', () => {
    const items = [fakeItem('file', 'image/png', null)]
    const clipboardData = { items } as unknown as DataTransfer

    expect(extractPastedImageFiles(clipboardData)).toEqual([])
  })
})
