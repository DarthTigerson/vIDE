import { registerChannel } from '../dispatch'
import type { UsageManager } from '../../usageManager'

// Usage channels require access to the UsageManager instance to call its methods.
// Unlike plain exported functions, these are instance methods, so we need to pass
// the manager through.
export function registerUsageRelayChannels(usageManager: UsageManager): void {
  registerChannel('usage:acquire', () => usageManager.acquire('mobile'))
  registerChannel('usage:release', () => usageManager.release('mobile'))
  registerChannel('usage:getLatest', () => usageManager.getLatest())
  registerChannel('usage:getRange', (fromTs: number, toTs: number, maxPoints?: number) =>
    usageManager.getRange(fromTs, toTs, maxPoints))
  registerChannel('usage:getPassiveEnabled', () => usageManager.getPassiveEnabled())
  registerChannel('usage:setPassiveEnabled', (enabled: boolean) => usageManager.setPassiveEnabled(enabled))
}
