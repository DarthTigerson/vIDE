import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: {}, net: {} }))

import { resolveAppFile, contentTypeFor } from '../appProtocol'

describe('resolveAppFile', () => {
  it('resolves files inside the root', () => {
    expect(resolveAppFile('/r', '/renderer.js')).toBe('/r/renderer.js')
    expect(resolveAppFile('/r', '/assets/a.svg')).toBe('/r/assets/a.svg')
  })
  it('rejects traversal', () => {
    expect(resolveAppFile('/r', '/../x')).toBeNull()
    expect(resolveAppFile('/r', '/%2e%2e/x')).toBeNull()
    expect(resolveAppFile('/r', '/a/../../x')).toBeNull()
  })
  it('rejects bad encoding and the root itself', () => {
    expect(resolveAppFile('/r', '/%zz')).toBeNull()
    expect(resolveAppFile('/r', '/')).toBeNull()
  })
})

describe('contentTypeFor', () => {
  it('maps extensions', () => {
    expect(contentTypeFor('a.js')).toBe('text/javascript')
    expect(contentTypeFor('a.mjs')).toBe('text/javascript')
    expect(contentTypeFor('a.css')).toBe('text/css')
    expect(contentTypeFor('a.json')).toBe('application/json')
    expect(contentTypeFor('a.svg')).toBe('image/svg+xml')
    expect(contentTypeFor('a.png')).toBe('image/png')
    expect(contentTypeFor('a.woff2')).toBe('font/woff2')
    expect(contentTypeFor('a.bin')).toBe('application/octet-stream')
  })
})
