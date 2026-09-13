import { registerChannel } from '../dispatch'
import {
  getOnboardingStatus, markOnboardingComplete, resetOnboarding,
  detectCli, getGitIdentity, setGitIdentity, primeAutomationPermission,
  openAutomationSettings,
} from '../../onboarding'

export function registerOnboardingRelayChannels(): void {
  registerChannel('onboarding:getStatus', () => getOnboardingStatus())
  registerChannel('onboarding:markComplete', () => markOnboardingComplete())
  registerChannel('onboarding:reset', () => resetOnboarding())
  registerChannel('onboarding:detectCli', (bin: string) => detectCli(bin))
  registerChannel('onboarding:getGitIdentity', () => getGitIdentity())
  registerChannel('onboarding:setGitIdentity', (name: string, email: string) => setGitIdentity(name, email))
  registerChannel('onboarding:primeAutomationPermission', () => primeAutomationPermission())
  registerChannel('onboarding:openAutomationSettings', () => openAutomationSettings())
}
