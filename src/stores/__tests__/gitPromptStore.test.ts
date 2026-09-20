import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGitPromptStore, requestForcePush } from '../gitPromptStore'
import { useGitStore } from '../gitStore'
import { useGitSettingsStore } from '../gitSettingsStore'

beforeEach(() => {
  useGitPromptStore.setState({ prompt: null })
})

describe('requestForcePush', () => {
  it('runs immediately when the force-push safety setting is off', () => {
    const forcePush = vi.fn()
    useGitStore.setState({ forcePush })
    useGitSettingsStore.setState({ forceSafetyEnabled: false })
    requestForcePush('forcePush', '/r')
    expect(forcePush).toHaveBeenCalledWith('/r')
    expect(useGitPromptStore.getState().prompt).toBeNull()
  })

  it('opens the existing confirm when the safety setting is on', () => {
    const forcePushLease = vi.fn()
    useGitStore.setState({ forcePushLease })
    useGitSettingsStore.setState({ forceSafetyEnabled: true })
    requestForcePush('forcePushLease', '/r')
    expect(forcePushLease).not.toHaveBeenCalled()
    expect(useGitPromptStore.getState().prompt).toEqual({ kind: 'forcePush', action: 'forcePushLease', cwd: '/r' })
  })
})

describe('open/close', () => {
  it('holds one prompt at a time and clears it', () => {
    useGitPromptStore.getState().open({ kind: 'undoCommit', cwd: '/r' })
    useGitPromptStore.getState().open({ kind: 'hardResetPick', cwd: '/r' })
    expect(useGitPromptStore.getState().prompt?.kind).toBe('hardResetPick')
    useGitPromptStore.getState().close()
    expect(useGitPromptStore.getState().prompt).toBeNull()
  })
})
