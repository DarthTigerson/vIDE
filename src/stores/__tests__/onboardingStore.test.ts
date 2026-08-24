import { describe, it, expect, beforeEach, vi } from 'vitest'

const { api } = vi.hoisted(() => {
  // isMac (src/lib/platform.ts) reads navigator.platform at module load
  // time, and onboardingStore's ONBOARDING_STEPS is built from isMac at its
  // own module load time — both globals must be in place before the static
  // import below runs, hence stubbing inside vi.hoisted rather than after.
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: 'MacIntel' },
    configurable: true,
    writable: true,
  })
  const api = {
    onboardingGetStatus: vi.fn(),
    onboardingMarkComplete: vi.fn().mockResolvedValue(undefined),
    onboardingReset: vi.fn().mockResolvedValue(undefined),
    fsWatchRoot: vi.fn(),
    gitWatchRoot: vi.fn(),
  }
  ;(globalThis as any).window = { api }
  return { api }
})

import { useOnboardingStore, ONBOARDING_STEPS } from '../onboardingStore'
import { useFileStore } from '../fileStore'

describe('ONBOARDING_STEPS', () => {
  it('includes the macOS-only permissions step when isMac is true', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'theme', 'assistants', 'features', 'git', 'permissions', 'done'])
  })
})

describe('onboardingStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOnboardingStore.setState({ open: false, stepIndex: 0 })
  })

  it('checkStatus opens the wizard at step 0 when onboarding is not yet completed', async () => {
    api.onboardingGetStatus.mockResolvedValue({ completed: false })
    await useOnboardingStore.getState().checkStatus()
    expect(useOnboardingStore.getState().open).toBe(true)
    expect(useOnboardingStore.getState().stepIndex).toBe(0)
  })

  it('checkStatus leaves the wizard closed when onboarding is already completed', async () => {
    api.onboardingGetStatus.mockResolvedValue({ completed: true })
    await useOnboardingStore.getState().checkStatus()
    expect(useOnboardingStore.getState().open).toBe(false)
  })

  it('next() advances one step at a time', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 0 })
    useOnboardingStore.getState().next()
    expect(useOnboardingStore.getState().stepIndex).toBe(1)
  })

  it('next() on the last step completes and closes the wizard instead of overrunning', () => {
    useOnboardingStore.setState({ open: true, stepIndex: ONBOARDING_STEPS.length - 1 })
    useOnboardingStore.getState().next()
    expect(useOnboardingStore.getState().open).toBe(false)
    expect(api.onboardingMarkComplete).toHaveBeenCalled()
  })

  it('back() does not go below step 0', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 0 })
    useOnboardingStore.getState().back()
    expect(useOnboardingStore.getState().stepIndex).toBe(0)
  })

  it('skip() closes the wizard and marks onboarding complete', () => {
    useOnboardingStore.setState({ open: true, stepIndex: 2 })
    useOnboardingStore.getState().skip()
    expect(useOnboardingStore.getState().open).toBe(false)
    expect(api.onboardingMarkComplete).toHaveBeenCalled()
  })

  it('replay() resets the flag on the main process and reopens at step 0', async () => {
    useOnboardingStore.setState({ open: false, stepIndex: 5 })
    await useOnboardingStore.getState().replay()
    expect(api.onboardingReset).toHaveBeenCalled()
    expect(useOnboardingStore.getState().open).toBe(true)
    expect(useOnboardingStore.getState().stepIndex).toBe(0)
  })

  it('replay() soft-resets the IDE, dropping back to the project picker', async () => {
    useFileStore.setState({ projectRoot: '/some/project', tree: [{ name: 'a', path: '/some/project/a', isDirectory: false }] })
    await useOnboardingStore.getState().replay()
    expect(useFileStore.getState().projectRoot).toBeNull()
    expect(useFileStore.getState().tree).toHaveLength(0)
  })
})
