import { describe, it, expect, beforeEach } from 'vitest'
import { useFileClipboardStore } from '../fileClipboardStore'

describe('fileClipboardStore', () => {
  beforeEach(() => useFileClipboardStore.getState().clear())

  it('starts empty', () => {
    expect(useFileClipboardStore.getState()).toMatchObject({ paths: [], mode: null })
  })

  it('remembers the last copy/cut and clears', () => {
    useFileClipboardStore.getState().set(['/a'], 'cut')
    expect(useFileClipboardStore.getState()).toMatchObject({ paths: ['/a'], mode: 'cut' })
    useFileClipboardStore.getState().clear()
    expect(useFileClipboardStore.getState()).toMatchObject({ paths: [], mode: null })
  })
})
