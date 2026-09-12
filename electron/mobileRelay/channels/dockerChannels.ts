import { registerChannel } from '../dispatch'
import {
  checkDockerStatus, listContainers, startContainer, stopContainer,
  restartContainer, removeContainer, startContainers, stopContainers,
  removeContainers, getContainerStats, openDockerApp, closeDockerApp,
} from '../../docker'

export function registerDockerRelayChannels(): void {
  registerChannel('docker:status', () => checkDockerStatus())
  registerChannel('docker:listContainers', () => listContainers())
  registerChannel('docker:startContainer', (id: string) => startContainer(id))
  registerChannel('docker:stopContainer', (id: string) => stopContainer(id))
  registerChannel('docker:restartContainer', (id: string) => restartContainer(id))
  registerChannel('docker:removeContainer', (id: string) => removeContainer(id))
  registerChannel('docker:startContainers', (ids: string[]) => startContainers(ids))
  registerChannel('docker:stopContainers', (ids: string[]) => stopContainers(ids))
  registerChannel('docker:removeContainers', (ids: string[]) => removeContainers(ids))
  registerChannel('docker:getContainerStats', () => getContainerStats())
  registerChannel('docker:openApp', () => openDockerApp())
  registerChannel('docker:closeApp', () => closeDockerApp())
}
