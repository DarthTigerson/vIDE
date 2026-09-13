import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../onboarding', () => ({
  getOnboardingStatus: vi.fn(async () => ({ complete: false })),
  markOnboardingComplete: vi.fn(async () => undefined),
  resetOnboarding: vi.fn(async () => undefined),
  detectCli: vi.fn(async (bin: string) => true),
  getGitIdentity: vi.fn(async () => ({ name: 'Test User', email: 'test@example.com' })),
  setGitIdentity: vi.fn(async (name: string, email: string) => undefined),
  primeAutomationPermission: vi.fn(async () => true),
  openAutomationSettings: vi.fn(() => undefined),
}))

import { registerOnboardingRelayChannels } from '../channels/onboardingChannels'

describe('onboardingChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerOnboardingRelayChannels()
  })

  it('maps onboarding:getStatus to getOnboardingStatus', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'onboarding:getStatus', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: { complete: false },
    })
  })

  it('maps onboarding:getGitIdentity to getGitIdentity', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'onboarding:getGitIdentity', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { name: 'Test User', email: 'test@example.com' },
    })
  })
})
