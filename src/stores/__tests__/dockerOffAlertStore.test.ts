import { describe, it, expect, beforeEach } from 'vitest'
import { useDockerOffAlertStore } from '../dockerOffAlertStore'

describe('dockerOffAlertStore', () => {
  beforeEach(() => {
    useDockerOffAlertStore.setState({ ignored: false, openRequest: 0 })
  })

  it('defaults to not ignored with no open request', () => {
    const state = useDockerOffAlertStore.getState()
    expect(state.ignored).toBe(false)
    expect(state.openRequest).toBe(0)
  })

  it('ignore sets ignored to true', () => {
    useDockerOffAlertStore.getState().ignore()
    expect(useDockerOffAlertStore.getState().ignored).toBe(true)
  })

  it('reset clears ignored back to false', () => {
    useDockerOffAlertStore.getState().ignore()
    useDockerOffAlertStore.getState().reset()
    expect(useDockerOffAlertStore.getState().ignored).toBe(false)
  })

  it('requestOpen increments openRequest on every call', () => {
    useDockerOffAlertStore.getState().requestOpen()
    expect(useDockerOffAlertStore.getState().openRequest).toBe(1)
    useDockerOffAlertStore.getState().requestOpen()
    expect(useDockerOffAlertStore.getState().openRequest).toBe(2)
  })
})
