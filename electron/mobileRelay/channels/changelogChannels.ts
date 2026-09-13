import { registerChannel } from '../dispatch'
import { getChangelogForVersion } from '../../changelog'

export function registerChangelogRelayChannels(): void {
  registerChannel('changelog:getForVersion', (version: string) => getChangelogForVersion(version))
}
