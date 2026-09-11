import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GraphifyPanel } from '../GraphifyPanel'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'
import { useEditorStore } from '@/stores/editorStore'
import { GRAPHIFY_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'

const { getProjectRoot, setProjectRoot } = vi.hoisted(() => {
  let projectRoot: string | null = '/project'
  return {
    getProjectRoot: () => projectRoot,
    setProjectRoot: (value: string | null) => {
      projectRoot = value
    },
  }
})

vi.mock('@/stores/fileStore', () => ({
  useFileStore: (selector: (s: { projectRoot: string | null }) => unknown) =>
    selector({ projectRoot: getProjectRoot() }),
}))

function resetStore() {
  useGraphifyStore.setState({
    available: null, checking: false, running: false, progress: '', error: null,
    graph: null, loadingGraph: false,
    checkAvailable: vi.fn(),
    run: vi.fn(),
    loadGraph: vi.fn(),
  })
}

describe('GraphifyPanel', () => {
  const openTabMock = vi.fn()

  beforeEach(() => {
    resetStore()
    openTabMock.mockClear()
    setProjectRoot('/project')
    // No discovered repo by default — activeRepo falls back to projectRoot,
    // matching every pre-existing test's expectations below. Tests that
    // specifically exercise the multi-repo scoping set this explicitly.
    useGitReposStore.setState({ repos: [], selectedRepo: null })
    useGitOpenReposStore.setState({ open: {} })
    useEditorStore.setState({ openTab: openTabMock })
  })

  it('shows install instructions when graphify is not available', () => {
    useGraphifyStore.setState({ available: false })
    render(<GraphifyPanel />)
    expect(screen.getByText(/uv tool install graphifyy/)).toBeInTheDocument()
  })

  it('the quick-launch button opens a terminal tab and copies the install command', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } })
    useGraphifyStore.setState({ available: false })
    render(<GraphifyPanel />)

    fireEvent.click(screen.getByRole('button', { name: /open terminal.*copy install command/i }))

    expect(writeTextMock).toHaveBeenCalledWith('uv tool install graphifyy && graphify install')
    expect(openTabMock).toHaveBeenCalledTimes(1)
    expect(openTabMock.mock.calls[0][0].path).toMatch(/^terminal:/)
  })

  it('shows a build button when available but no graph yet', () => {
    useGraphifyStore.setState({ available: true, graph: null })
    render(<GraphifyPanel />)
    expect(screen.getByRole('button', { name: /build graph/i })).toBeInTheDocument()
  })

  it('shows a rebuild button once a graph exists', () => {
    useGraphifyStore.setState({
      available: true,
      graph: { directed: false, multigraph: false, nodes: [], links: [], hyperedges: [] },
    })
    render(<GraphifyPanel />)
    expect(screen.getByRole('button', { name: /rebuild graph/i })).toBeInTheDocument()
  })

  it('clicking build graph calls run with the project root when no repo is discovered', () => {
    const runMock = vi.fn()
    useGraphifyStore.setState({ available: true, graph: null, run: runMock })
    render(<GraphifyPanel />)
    fireEvent.click(screen.getByRole('button', { name: /build graph/i }))
    expect(runMock).toHaveBeenCalledWith('/project')
  })

  it('clicking build graph calls run with the active repo, not the whole project root, in a multi-repo project', () => {
    // The bug this guards: projectRoot can be an umbrella folder holding many
    // independent repos, and running graphify against it recursively indexes
    // every repo underneath — real reported performance problem. It must
    // scope to whichever repo is actually active instead.
    const runMock = vi.fn()
    useGitReposStore.setState({ repos: ['/project/repoA', '/project/repoB'], selectedRepo: '/project/repoB' })
    useGitOpenReposStore.setState({ open: { '/project/repoB': true } })
    useGraphifyStore.setState({ available: true, graph: null, run: runMock })
    render(<GraphifyPanel />)
    fireEvent.click(screen.getByRole('button', { name: /build graph/i }))
    expect(runMock).toHaveBeenCalledWith('/project/repoB')
  })

  it('shows the active repo\'s name in the panel header', () => {
    useGitReposStore.setState({ repos: ['/project/repoA', '/project/repoB'], selectedRepo: '/project/repoB' })
    useGitOpenReposStore.setState({ open: { '/project/repoB': true } })
    useGraphifyStore.setState({ available: true })
    render(<GraphifyPanel />)
    expect(screen.getByText('repoB')).toBeInTheDocument()
  })

  it('shows progress text while running', () => {
    useGraphifyStore.setState({ available: true, running: true, progress: 'extracting files...' })
    render(<GraphifyPanel />)
    expect(screen.getByText('extracting files...')).toBeInTheDocument()
  })

  it('the default running placeholder (before any progress output arrives) names the active repo', () => {
    useGitReposStore.setState({ repos: ['/project/repoA', '/project/repoB'], selectedRepo: '/project/repoB' })
    useGitOpenReposStore.setState({ open: { '/project/repoB': true } })
    useGraphifyStore.setState({ available: true, running: true, progress: '' })
    render(<GraphifyPanel />)
    expect(screen.getByText('Running graphify on repoB…')).toBeInTheDocument()
  })

  it('shows an error message (including folded stderr tail) when the last run failed', () => {
    useGraphifyStore.setState({
      available: true,
      error: 'graphify exited with code 1:\nTraceback (most recent call last):\nRuntimeError: boom',
    })
    render(<GraphifyPanel />)
    expect(screen.getByText(/RuntimeError: boom/)).toBeInTheDocument()
  })

  it('does not show the error banner while a new run is in progress', () => {
    useGraphifyStore.setState({ available: true, running: true, progress: 'working...', error: 'stale error' })
    render(<GraphifyPanel />)
    expect(screen.queryByText('stale error')).not.toBeInTheDocument()
  })

  it('"Open Graph" opens the graphify graph tab and reloads the graph for the current project', () => {
    const loadGraphMock = vi.fn()
    useGraphifyStore.setState({ available: true, loadGraph: loadGraphMock })
    render(<GraphifyPanel />)

    fireEvent.click(screen.getByRole('button', { name: /open graph/i }))

    expect(openTabMock).toHaveBeenCalledWith({ path: GRAPHIFY_GRAPH_TAB_PATH, content: '', dirty: false })
    expect(loadGraphMock).toHaveBeenCalledWith('/project')
  })

  it('"Open Report" opens the GRAPH_REPORT.md markdown-preview tab for the current project', () => {
    useGraphifyStore.setState({ available: true })
    render(<GraphifyPanel />)

    fireEvent.click(screen.getByRole('button', { name: /open report/i }))

    expect(openTabMock).toHaveBeenCalledWith({
      path: buildMarkdownPreviewPath('/project/graphify-out/GRAPH_REPORT.md'),
      content: '',
      dirty: false,
    })
  })

  it('"Open Graph" and "Open Report" read from the active repo\'s own graphify-out, not the project root, in a multi-repo project', () => {
    const loadGraphMock = vi.fn()
    useGitReposStore.setState({ repos: ['/project/repoA', '/project/repoB'], selectedRepo: '/project/repoB' })
    useGitOpenReposStore.setState({ open: { '/project/repoB': true } })
    useGraphifyStore.setState({ available: true, loadGraph: loadGraphMock })
    render(<GraphifyPanel />)

    fireEvent.click(screen.getByRole('button', { name: /open graph/i }))
    expect(loadGraphMock).toHaveBeenCalledWith('/project/repoB')

    fireEvent.click(screen.getByRole('button', { name: /open report/i }))
    expect(openTabMock).toHaveBeenCalledWith({
      path: buildMarkdownPreviewPath('/project/repoB/graphify-out/GRAPH_REPORT.md'),
      content: '',
      dirty: false,
    })
  })

  it('auto-opens the Graph tab the moment a build finishes successfully', () => {
    useGraphifyStore.setState({ available: true, running: true, graph: null })
    render(<GraphifyPanel />)
    expect(openTabMock).not.toHaveBeenCalled()

    act(() => {
      useGraphifyStore.setState({
        running: false,
        error: null,
        graph: { directed: false, multigraph: false, nodes: [], links: [], hyperedges: [] },
      })
    })

    expect(openTabMock).toHaveBeenCalledWith({ path: GRAPHIFY_GRAPH_TAB_PATH, content: '', dirty: false })
  })

  it('does not auto-open the Graph tab when a build finishes with an error', () => {
    useGraphifyStore.setState({ available: true, running: true, graph: null })
    render(<GraphifyPanel />)

    act(() => {
      useGraphifyStore.setState({ running: false, error: 'graphify exited with code 1', graph: null })
    })

    expect(openTabMock).not.toHaveBeenCalled()
  })

  it('shows no repo name and disables every action in a multi-repo project when nothing is open, even though selectedRepo has an internal auto-picked value', () => {
    // Reported bug: setRepos auto-populates selectedRepo internally (so the
    // Git panel/palette have data ready) even before the user has opened
    // anything — Graphify must not trust that value on its own, the same gap
    // VIDE-87 already fixed for the activity-bar badge.
    useGitReposStore.setState({ repos: ['/project/repoA', '/project/repoB'], selectedRepo: '/project/repoA' })
    useGitOpenReposStore.setState({ open: {} })
    useGraphifyStore.setState({ available: true, graph: null })
    render(<GraphifyPanel />)

    expect(screen.queryByText('repoA')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /build graph/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /open graph/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /open report/i })).toBeDisabled()
    expect(screen.getByText(/No repo open/)).toBeInTheDocument()
  })

  it('disables Build/Rebuild, Open Graph, and Open Report when there is no project open', () => {
    setProjectRoot(null)
    useGraphifyStore.setState({ available: true, graph: null })
    render(<GraphifyPanel />)

    expect(screen.getByRole('button', { name: /build graph/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /open graph/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /open report/i })).toBeDisabled()
  })
})
