import { describe, it, expect, beforeEach } from 'vitest'
import { useDockerOffAlertStore } from '../dockerOffAlertStore'

describe('dockerOffAlertStore', () => {
  beforeEach(() => {
    useDockerOffAlertStore.setState({ openRequest: 0 })
  })

  it('defaults to no open request', () => {
    expect(useDockerOffAlertStore.getState().openRequest).toBe(0)
  })

  it('requestOpen increments openRequest on every call', () => {
    useDockerOffAlertStore.getState().requestOpen()
    expect(useDockerOffAlertStore.getState().openRequest).toBe(1)
    useDockerOffAlertStore.getState().requestOpen()
    expect(useDockerOffAlertStore.getState().openRequest).toBe(2)
  })
})
