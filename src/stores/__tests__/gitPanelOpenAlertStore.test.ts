import { describe, it, expect, beforeEach } from 'vitest'
import { useGitPanelOpenAlertStore } from '../gitPanelOpenAlertStore'

describe('gitPanelOpenAlertStore', () => {
  beforeEach(() => {
    useGitPanelOpenAlertStore.setState({ openRequest: 0 })
  })

  it('defaults to no open request', () => {
    expect(useGitPanelOpenAlertStore.getState().openRequest).toBe(0)
  })

  it('requestOpen increments openRequest on every call', () => {
    useGitPanelOpenAlertStore.getState().requestOpen()
    expect(useGitPanelOpenAlertStore.getState().openRequest).toBe(1)
    useGitPanelOpenAlertStore.getState().requestOpen()
    expect(useGitPanelOpenAlertStore.getState().openRequest).toBe(2)
  })
})
