/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { DockerLogsPage } from '../DockerLogsPage'
import { buildDockerLogsPath } from '../paths'
import { useDockerStore } from '@/stores/dockerStore'

const path = buildDockerLogsPath('abc123', 'book_hero-backend-1')

beforeEach(() => {
  useDockerStore.setState({
    containers: [
      { id: 'abc123', name: 'book_hero-backend-1', image: 'backend', status: 'Up 33 seconds (healthy)', state: 'running', ports: '' },
    ],
    refresh: vi.fn().mockResolvedValue(undefined),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    restartContainer: vi.fn(),
  })
  ;(global as any).window.api = {
    ...(global as any).window.api,
    dockerRunLogs: vi.fn(),
    dockerStopLogs: vi.fn(),
    onDockerLogData: vi.fn(() => () => {}),
    onDockerLogExit: vi.fn(() => () => {}),
    onDockerChanged: vi.fn(() => () => {}),
  }
})
afterEach(() => cleanup())

describe('DockerLogsPage', () => {
  it('still shows the container name, status and its Stop / Restart controls', () => {
    render(<DockerLogsPage path={path} />)
    expect(screen.getByRole('heading', { name: 'book_hero-backend-1' })).toBeInTheDocument()
    expect(screen.getByText('Up 33 seconds (healthy)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  it('shows the logs in the app terminal (VIDE-112), not a plain <pre> that text could not be selected in', async () => {
    const { container } = render(<DockerLogsPage path={path} />)
    await waitFor(() => expect(container.querySelector('.xterm-helper-textarea')).not.toBeNull())
    expect(container.querySelector('pre')).toBeNull()
  })

  it('streams the logs of the container in the tab path', async () => {
    render(<DockerLogsPage path={path} />)
    await waitFor(() => expect(window.api.dockerRunLogs).toHaveBeenCalled())
    expect((window.api.dockerRunLogs as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('abc123')
  })
})
