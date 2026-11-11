import { describe, it, expect } from 'vitest'
import {
  isImageFile, isMarkdownFile, imageMimeType, isRasterImageFile, isSvgFile, needsImageConversion, isPdfFile,
} from '../fileKinds'

describe('isImageFile', () => {
  it('recognizes common image extensions', () => {
    for (const name of ['logo.png', 'photo.JPG', 'icon.svg', 'anim.gif', 'a.webp', 'a.avif', 'a.ico', 'a.bmp']) {
      expect(isImageFile(name)).toBe(true)
    }
  })

  it('rejects non-image files', () => {
    for (const name of ['index.ts', 'README.md', 'noext']) {
      expect(isImageFile(name)).toBe(false)
    }
  })
})

describe('isMarkdownFile', () => {
  it('recognizes markdown extensions', () => {
    expect(isMarkdownFile('README.md')).toBe(true)
    expect(isMarkdownFile('NOTES.MARKDOWN')).toBe(true)
  })

  it('rejects non-markdown files', () => {
    expect(isMarkdownFile('logo.png')).toBe(false)
    expect(isMarkdownFile('index.ts')).toBe(false)
  })
})

describe('imageMimeType', () => {
  it('maps extensions to mime types', () => {
    expect(imageMimeType('a.png')).toBe('image/png')
    expect(imageMimeType('a.jpg')).toBe('image/jpeg')
    expect(imageMimeType('a.svg')).toBe('image/svg+xml')
    expect(imageMimeType('a.ico')).toBe('image/x-icon')
    expect(imageMimeType('a.webp')).toBe('image/webp')
  })
})

describe('viewer extension file kinds', () => {
  it('splits raster images from SVG and flags the formats that need conversion', () => {
    expect(isRasterImageFile('a.png')).toBe(true)
    expect(isRasterImageFile('a.svg')).toBe(false)
    expect(isSvgFile('A.SVG')).toBe(true)
    for (const name of ['a.tif', 'a.TIFF', 'a.heic', 'a.heif']) {
      expect(isRasterImageFile(name)).toBe(true)
      expect(needsImageConversion(name)).toBe(true)
    }
    expect(needsImageConversion('a.png')).toBe(false)
  })
})

describe('isPdfFile', () => {
  it('matches .pdf in any case and nothing else', () => {
    expect(isPdfFile('a.pdf')).toBe(true)
    expect(isPdfFile('A.PDF')).toBe(true)
    expect(isPdfFile('a.pdf.txt')).toBe(false)
    expect(isPdfFile('pdf')).toBe(false)
  })
})
