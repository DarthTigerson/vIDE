// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { openFileAtLocation } = vi.hoisted(() => ({ openFileAtLocation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/openFileLocation', () => ({ openFileAtLocation }))

import { createFilePathActivateHandler, resolveInKnownRepos } from '../terminalLinks'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'

// Multi-repo workspace: project root holds several repos, and Claude's tool
// headers print paths relative to whichever repo it ran in.
const ROOT = '/work'
const REPOS = ['/work/apps', '/work/bases']

function mockExisting(paths: string[]) {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    pathExists: vi.fn(async (p: string) => paths.includes(p)),
    getHomeDir: vi.fn().mockResolvedValue('/Users/thomas'),
  }
}

describe('repo-relative terminal file links', () => {
  beforeEach(() => {
    useFileStore.setState({ projectRoot: ROOT })
    useGitReposStore.setState({ repos: REPOS, selectedRepo: '/work/apps' })
    useStatusMessageStore.setState({ message: null })
    openFileAtLocation.mockClear()
  })

  afterEach(() => {
    useFileStore.setState({ projectRoot: null })
    useGitReposStore.setState({ repos: [], selectedRepo: null })
  })

  it('opens a path that only exists relative to a nested repo (reported bug)', async () => {
    mockExisting(['/work/bases/helm-charts/traefik.yaml'])
    await createFilePathActivateHandler()(new MouseEvent('mouseup'), 'helm-charts/traefik.yaml:56')
    expect(openFileAtLocation).toHaveBeenCalledWith('/work/bases/helm-charts/traefik.yaml', 56, undefined)
  })

  it('still prefers the project root when the path exists there', async () => {
    mockExisting(['/work/helm-charts/traefik.yaml', '/work/bases/helm-charts/traefik.yaml'])
    await createFilePathActivateHandler()(new MouseEvent('mouseup'), 'helm-charts/traefik.yaml')
    expect(openFileAtLocation).toHaveBeenCalledWith('/work/helm-charts/traefik.yaml', undefined, undefined)
  })

  it('prefers the selected repo when several repos contain the path', async () => {
    useGitReposStore.setState({ selectedRepo: '/work/bases' })
    mockExisting(['/work/apps/docs/a.md', '/work/bases/docs/a.md'])
    expect(await resolveInKnownRepos('docs/a.md')).toBe('/work/bases/docs/a.md')
  })

  it('does not search repos for absolute paths', async () => {
    mockExisting([])
    expect(await resolveInKnownRepos('/work/bases/x/y.yaml')).toBeNull()
    expect(window.api.pathExists).not.toHaveBeenCalled()
  })

  it('shows a status message instead of silently doing nothing when the file is missing', async () => {
    mockExisting([])
    await createFilePathActivateHandler()(new MouseEvent('mouseup'), 'helm-charts/missing.yaml')
    expect(openFileAtLocation).not.toHaveBeenCalled()
    expect(useStatusMessageStore.getState().message).toBe('File not found: helm-charts/missing.yaml')
  })
})
