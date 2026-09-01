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
const stoppedWebappCaddy: DockerContainer = {
  id: 'a1', name: 'gpt-webapp-caddy-1', image: 'caddy', status: 'Exited', state: 'exited', ports: '', project: 'gpt-webapp',
}
const stoppedWebappDb: DockerContainer = {
  id: 'a2', name: 'gpt-webapp-db-1', image: 'postgres', status: 'Exited', state: 'exited', ports: '', project: 'gpt-webapp',
}

function setup(containers: DockerContainer[]) {
  ;(global as any).window.api = {
    dockerStatus: vi.fn().mockResolvedValue('running'),
    dockerListContainers: vi.fn().mockResolvedValue(containers),
    dockerStartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRestartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStartContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerOpenApp: vi.fn().mockResolvedValue({ ok: true }),
    dockerWatch: vi.fn(),
    dockerUnwatch: vi.fn(),
    onDockerChanged: vi.fn().mockReturnValue(() => {}),
  }
  useDockerStore.setState({ status: 'unknown', containers: [], loading: false, watching: false, watcherRefCount: 0 })
}

// Every row/group action now lives behind a kebab (⋮) trigger rather than
// its own always-visible button — open the trigger before looking for the
// action inside its dropdown.
function openMenu(triggerName: string) {
  fireEvent.click(screen.getByRole('button', { name: triggerName }))
}

describe('DockerPanel — grouping and global controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the status dot and short state label next to the Docker title when running', async () => {
    setup([])
    render(<DockerPanel />)
    expect(await screen.findByText('Running')).toBeTruthy()
    expect(screen.getByText('Docker')).toBeTruthy()
  })

  it('shows the short state label next to the title when stopped, with no separate status row', async () => {
    setup([])
    ;(window.api.dockerStatus as ReturnType<typeof vi.fn>).mockResolvedValue('stopped')
    render(<DockerPanel />)
    expect(await screen.findByText('Not running')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
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
    expect(screen.queryByRole('button', { name: 'gpt-webapp actions' })).toBeNull()
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

  it('Stop All is disabled when nothing is running, Clean Slate is disabled with no containers', async () => {
    setup([{ ...standalone }])
    render(<DockerPanel />)
    await screen.findByText('standalone')
    expect(screen.getByRole('button', { name: 'Stop All Containers' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Clean Slate/ })).not.toBeDisabled()
  })

  it('Stop All opens a confirmation before calling the batch stop action', async () => {
    setup([webappCaddy, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Stop All Containers' }))
    expect(screen.getByText('Stop All Containers')).toBeTruthy()
    expect(window.api.dockerStopContainers).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Stop All', exact: true }))
    await waitFor(() =>
      expect(window.api.dockerStopContainers).toHaveBeenCalledWith(['a1', 'b1'])
    )
  })

  it('shows a spinner and disables Stop All while the batch action is in flight', async () => {
    setup([webappCaddy, otherApi])
    let resolveStop: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStopContainers as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Stop All Containers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop All', exact: true }))

    const stopAllButton = await screen.findByRole('button', { name: 'Stop All Containers' })
    await waitFor(() => expect(stopAllButton).toHaveAttribute('aria-busy', 'true'))
    expect(stopAllButton).toBeDisabled()

    resolveStop({ ok: true })
    await waitFor(() => expect(stopAllButton).toHaveAttribute('aria-busy', 'false'))
  })

  it('Clean Slate opens a confirmation before calling the batch remove action', async () => {
    setup([webappCaddy, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: /Clean Slate/ }))
    expect(screen.getByText('Clean Slate', { selector: 'h2' })).toBeTruthy()
    expect(window.api.dockerRemoveContainers).not.toHaveBeenCalled()
  })

  it('confirming Clean Slate calls removeContainers with every container id', async () => {
    setup([webappCaddy, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: /Clean Slate/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clean Slate', exact: true }))

    await waitFor(() =>
      expect(window.api.dockerRemoveContainers).toHaveBeenCalledWith(['a1', 'b1'])
    )
  })

  it('opening a group\'s action menu and choosing Remove opens a confirmation, which removes only that group', async () => {
    setup([webappCaddy, webappDb, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))

    const modal = screen.getByText('Remove gpt-webapp', { selector: 'h2' }).closest('div')!
    fireEvent.click(within(modal).getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(window.api.dockerRemoveContainers).toHaveBeenCalledWith(['a1', 'a2'])
    )
  })

  it('choosing Stop from a group\'s action menu stops only that group\'s containers', async () => {
    setup([webappCaddy, webappDb, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }))

    await waitFor(() =>
      expect(window.api.dockerStopContainers).toHaveBeenCalledWith(['a1', 'a2'])
    )
  })

  it('disables the container action trigger while its Stop is in flight, then re-enables it', async () => {
    setup([webappCaddy])
    let resolveStop: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStopContainer as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp-caddy-1')

    openMenu('gpt-webapp-caddy-1 actions')
    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }))

    const trigger = screen.getByRole('button', { name: 'gpt-webapp-caddy-1 actions' })
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'true'))
    expect(trigger).toBeDisabled()

    resolveStop({ ok: true })
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'false'))
  })

  it('shows Start and Stop in a fully-stopped group\'s menu, Start enabled and Stop disabled', async () => {
    setup([stoppedWebappCaddy, stoppedWebappDb])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    expect(screen.getByRole('button', { name: 'Start', exact: true })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled()
  })

  it('a fully-running group disables Start and enables Stop in its menu', async () => {
    setup([webappCaddy, webappDb])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    expect(screen.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stop', exact: true })).not.toBeDisabled()
  })

  it('choosing Start from a group\'s action menu starts only that group\'s containers', async () => {
    setup([stoppedWebappCaddy, stoppedWebappDb, otherApi])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Start', exact: true }))

    await waitFor(() =>
      expect(window.api.dockerStartContainers).toHaveBeenCalledWith(['a1', 'a2'])
    )
  })

  it('disables the group action trigger while the group Start is in flight', async () => {
    setup([stoppedWebappCaddy, stoppedWebappDb])
    let resolveStart: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStartContainers as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStart = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Start', exact: true }))

    const trigger = screen.getByRole('button', { name: 'gpt-webapp actions' })
    expect(trigger).toBeDisabled()

    resolveStart({ ok: true })
    await waitFor(() => expect(trigger).not.toBeDisabled())
  })

  it('disables the group action trigger while the group Stop is in flight', async () => {
    setup([webappCaddy, webappDb])
    let resolveStop: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStopContainers as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }))

    const trigger = screen.getByRole('button', { name: 'gpt-webapp actions' })
    expect(trigger).toBeDisabled()

    resolveStop({ ok: true })
    await waitFor(() => expect(trigger).not.toBeDisabled())
  })

  it('shows a spinner in the single-container remove modal while removing', async () => {
    setup([standalone])
    let resolveRemove: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerRemoveContainer as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveRemove = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('standalone')

    openMenu('standalone actions')
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))

    const modal = screen.getByText('Remove container', { selector: 'h2' }).closest('div')!
    const confirmButton = within(modal).getByRole('button', { name: 'Remove' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).toBeDisabled()

    resolveRemove({ ok: true })
    await waitFor(() => expect(screen.queryByText('Remove container')).toBeNull())
  })

  it('shows a spinner in the group remove modal while removing', async () => {
    setup([webappCaddy, webappDb])
    let resolveRemove: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerRemoveContainers as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveRemove = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    openMenu('gpt-webapp actions')
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))

    const modal = screen.getByText('Remove gpt-webapp', { selector: 'h2' }).closest('div')!
    const confirmButton = within(modal).getByRole('button', { name: 'Remove' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).toBeDisabled()

    resolveRemove({ ok: true })
    await waitFor(() => expect(screen.queryByText('Remove gpt-webapp', { selector: 'h2' })).toBeNull())
  })

  it('choosing Remove from a container row\'s action menu opens the single-container confirm modal', async () => {
    setup([standalone])
    render(<DockerPanel />)
    await screen.findByText('standalone')

    openMenu('standalone actions')
    fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }))

    const modal = screen.getByText('Remove container', { selector: 'h2' }).closest('div')!
    expect(within(modal).getByText('standalone', { exact: false })).toBeTruthy()
  })

  it('shows the empty-state illustration and a Launch Docker button when Docker is stopped, with no redundant status row', async () => {
    setup([])
    ;(window.api.dockerStatus as ReturnType<typeof vi.fn>).mockResolvedValue('stopped')
    render(<DockerPanel />)

    expect(await screen.findByText(/Docker isn't running\. Launch it/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Launch Docker' })).not.toBeDisabled()
    expect(screen.queryByText('Docker not running')).toBeNull()
  })

  it('clicking Launch Docker calls openApp and shows a spinner while launching', async () => {
    setup([])
    ;(window.api.dockerStatus as ReturnType<typeof vi.fn>).mockResolvedValue('stopped')
    let resolveOpen: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerOpenApp as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveOpen = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText(/Docker isn't running\. Launch it/)

    const launchButton = screen.getByRole('button', { name: 'Launch Docker' })
    fireEvent.click(launchButton)

    await waitFor(() => expect(launchButton).toHaveAttribute('aria-busy', 'true'))
    expect(launchButton).toBeDisabled()
    expect(window.api.dockerOpenApp).toHaveBeenCalled()

    resolveOpen({ ok: true })
    await waitFor(() => expect(launchButton).toHaveAttribute('aria-busy', 'false'))
  })

  it('the action menu closes after selecting an item', async () => {
    setup([webappCaddy])
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp-caddy-1')

    openMenu('gpt-webapp-caddy-1 actions')
    expect(screen.getByRole('button', { name: 'Restart', exact: true })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }))
    expect(screen.queryByRole('button', { name: 'Restart', exact: true })).toBeNull()

    await waitFor(() => expect(window.api.dockerStopContainer).toHaveBeenCalled())
  })
})
