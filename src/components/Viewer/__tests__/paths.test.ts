import { describe, it, expect } from 'vitest'
import {
  isImagePreviewTab,
  buildImagePreviewPath,
  parseImagePreviewPath,
  isMarkdownPreviewTab,
  buildMarkdownPreviewPath,
  parseMarkdownPreviewPath,
} from '../paths'

describe('image preview virtual tab paths', () => {
  it('builds an image preview path', () => {
    expect(buildImagePreviewPath('/proj/assets/logo.png')).toBe(
      'image-preview:///proj/assets/logo.png'
    )
  })

  it('recognizes image preview tabs', () => {
    expect(isImagePreviewTab('image-preview:///proj/assets/logo.png')).toBe(true)
    expect(isImagePreviewTab('/proj/assets/logo.png')).toBe(false)
    expect(isImagePreviewTab('markdown-preview:///proj/README.md')).toBe(false)
  })

  it('round-trips build -> parse', () => {
    const built = buildImagePreviewPath('/proj/assets/logo.png')
    expect(parseImagePreviewPath(built)).toBe('/proj/assets/logo.png')
  })
})

describe('markdown preview virtual tab paths', () => {
  it('builds a markdown preview path', () => {
    expect(buildMarkdownPreviewPath('/proj/README.md')).toBe(
      'markdown-preview:///proj/README.md'
    )
  })

  it('recognizes markdown preview tabs', () => {
    expect(isMarkdownPreviewTab('markdown-preview:///proj/README.md')).toBe(true)
    expect(isMarkdownPreviewTab('/proj/README.md')).toBe(false)
    expect(isMarkdownPreviewTab('image-preview:///proj/assets/logo.png')).toBe(false)
  })

  it('round-trips build -> parse', () => {
    const built = buildMarkdownPreviewPath('/proj/README.md')
    expect(parseMarkdownPreviewPath(built)).toBe('/proj/README.md')
  })
})
