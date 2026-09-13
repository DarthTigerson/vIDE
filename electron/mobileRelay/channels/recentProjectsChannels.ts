import { registerChannel } from '../dispatch'
import { readRecents, addRecentProject, clearRecentProjects } from '../../recentProjects'

export function registerRecentProjectsRelayChannels(): void {
  registerChannel('recentProjects:list', () => readRecents())
  registerChannel('recentProjects:add', (path: string) => addRecentProject(path))
  registerChannel('recentProjects:clear', () => clearRecentProjects())
}
