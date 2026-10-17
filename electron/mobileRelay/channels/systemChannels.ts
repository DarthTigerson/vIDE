import { registerChannel } from '../dispatch'
import { getSystemMemoryUsage } from '../../systemMemory'
import { getBatteryStatus } from '../../systemBattery'

export function registerSystemRelayChannels(): void {
  registerChannel('system:getMemoryUsage', () => getSystemMemoryUsage())
  registerChannel('system:getBattery', () => getBatteryStatus())
}
