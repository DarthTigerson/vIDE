import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { DockerPanel } from '../DockerPanel'
import { useDockerStore } from '@/stores/dockerStore'
import type { DockerContainer } from '@/types/api'

const webappCaddy: DockerContainer = {
  id: 'a1', name: 'gpt-webapp-caddy-1', image: 'caddy', status: 'Up', state: 'running', ports: '', project: 'gpt-webapp',
}
const webappDb: DockerContainer = {
  id: 'a2', name: 'gpt-webapp-db-1', image: 'postgres', status: 'Up', state: 'running', ports: '', project: 'gpt-webapp',
}
const otherApi: DockerContainer = {
  id: 'b1', name: 'other-api-1', image: 'node', status: 'Up', state: 'running', ports: '', project: 'other-api',
}
const standalone: DockerContainer = {
  id: 'c1', name: 'standalone', image: 'redis', status: 'Exited', state: 'exited', ports: '',
}

function setup(containers: DockerContainer[]) {
  ;(global as any).window.api = {
    dockerStatus: vi.fn().mockResolvedValue('running'),
    dockerListContainers: vi.fn().mockResolvedValue(containers),
    dockerStartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRestartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerOpenApp: vi.fn().mockResolvedValue({ ok: true }),
    dockerWatch: vi.fn(),
    dockerUnwatch: vi.fn(),
    onDockerChanged: vi.fn().mockReturnValue(() => {}),
  }
  useDockerStore.setState({ status: 'unknown', containers: [], loading: false, watching: false, watcherRefCount: 0 })
}

describe('DockerPanel — grouping and global controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('groups containers under their compose project without interleaving another project', async () => {
    setup([webappCaddy, otherApi, webappDb])
    render(<DockerPanel />)

    const webappGroup = await screen.findByText('gpt-webapp')
    const otherGroup = screen.getByText('other-api')
    expect(webappGroup).toBeTruthy()
    expect(otherGroup).toBeTruthy()

    const list = screen.getByText('gpt-webapp').closest('li')!
    expect(within(list).getByText('gpt-webapp-caddy-1')).toBeTruthy()
    expect(within(list).getByText('gpt-webapp-db-1')).toBeTruthy()
    expect(within(list).queryByText('other-api-1')).toBeNull()
  })

  it('renders a container with no compose project as a flat row with no group header', async () => {
    setup([standalone])
    render(<DockerPanel />)
    expect(await screen.findByText('standalone')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Stop gpt-webapp/ })).toBeNull()
  })

  it('collapsing a group hides its containers', async () => {
    setup([webappCaddy, webappDb])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp-caddy-1')

    fireEvent.click(screen.getByText('gpt-webapp'))
    expect(screen.queryByText('gpt-webapp-caddy-1')).toBeNull()

    fireEvent.click(screen.getByText('gpt-webapp'))
    expect(await screen.findByText('gpt-webapp-caddy-1')).toBeTruthy()
  })

  it('Stop All is disabled when nothing is running', async () => {
    setup([{ ...standalone }])
    render(<DockerPanel />)
    await screen.findByText('standalone')
    expect(screen.getByRole('button', { name: 'Stop All' })).toBeDisabled()
  })

  it('Remove All opens a confirmation before calling the batch remove action', async () => {
    setup([webappCaddy, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Remove All Containers' }))
    expect(screen.getByText('Remove All Containers')).toBeTruthy()
    expect(window.api.dockerRemoveContainers).not.toHaveBeenCalled()
  })

  it('confirming Remove All calls removeContainers with every container id', async () => {
    setup([webappCaddy, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Remove All Containers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove All', exact: true }))

    await waitFor(() =>
      expect(window.api.dockerRemoveContainers).toHaveBeenCalledWith(['a1', 'b1'])
    )
  })

  it('confirming a group remove only removes that group\'s containers', async () => {
    setup([webappCaddy, webappDb, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Remove gpt-webapp' }))
    const modal = screen.getByText('Remove gpt-webapp', { selector: 'h2' }).closest('div')!
    fireEvent.click(within(modal).getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(window.api.dockerRemoveContainers).toHaveBeenCalledWith(['a1', 'a2'])
    )
  })

  it('clicking a group Stop button stops only that group\'s containers', async () => {
    setup([webappCaddy, webappDb, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Stop gpt-webapp' }))

    await waitFor(() =>
      expect(window.api.dockerStopContainers).toHaveBeenCalledWith(['a1', 'a2'])
    )
  })
})
