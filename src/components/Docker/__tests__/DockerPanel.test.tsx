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

  it('disables the other row actions on a container while its Stop is in flight', async () => {
    setup([webappCaddy])
    let resolveStop: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStopContainer as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp-caddy-1')

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()

    resolveStop({ ok: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart' })).not.toBeDisabled())
  })

  it('disables the group Remove button while the group Stop is in flight', async () => {
    setup([webappCaddy, webappDb])
    let resolveStop: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerStopContainers as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveStop = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('gpt-webapp')

    fireEvent.click(screen.getByRole('button', { name: 'Stop gpt-webapp' }))
    expect(screen.getByRole('button', { name: 'Remove gpt-webapp' })).toBeDisabled()

    resolveStop({ ok: true })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove gpt-webapp' })).not.toBeDisabled())
  })

  it('shows a spinner in the single-container remove modal while removing', async () => {
    setup([standalone])
    let resolveRemove: (result: { ok: boolean }) => void = () => {}
    ;(window.api.dockerRemoveContainer as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolveRemove = resolve })
    )
    render(<DockerPanel />)
    await screen.findByText('standalone')

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'Remove gpt-webapp' }))
    const modal = screen.getByText('Remove gpt-webapp', { selector: 'h2' }).closest('div')!
    const confirmButton = within(modal).getByRole('button', { name: 'Remove' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).toBeDisabled()

    resolveRemove({ ok: true })
    await waitFor(() => expect(screen.queryByText('Remove gpt-webapp', { selector: 'h2' })).toBeNull())
  })
})
