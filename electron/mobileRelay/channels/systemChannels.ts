import { registerChannel } from '../dispatch'
import { getSystemMemoryUsage } from '../../systemMemory'

export function registerSystemRelayChannels(): void {
  registerChannel('system:getMemoryUsage', () => getSystemMemoryUsage())
}
