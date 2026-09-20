import { describe, it, expect, beforeEach } from 'vitest'
import { usePanelRequestStore } from '../panelRequestStore'

beforeEach(() => usePanelRequestStore.setState({ request: null }))

describe('panelRequestStore', () => {
  it('starts with no request', () => {
    expect(usePanelRequestStore.getState().request).toBeNull()
  })

  it('records the requested panel', () => {
    usePanelRequestStore.getState().requestPanel('llama')
    expect(usePanelRequestStore.getState().request?.panel).toBe('llama')
  })

  it('a repeated request for the same panel is a new value, so listeners fire again', () => {
    usePanelRequestStore.getState().requestPanel('files')
    const first = usePanelRequestStore.getState().request
    usePanelRequestStore.getState().requestPanel('files')
    expect(usePanelRequestStore.getState().request).not.toBe(first)
  })
})
