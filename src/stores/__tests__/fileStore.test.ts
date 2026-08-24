import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFileStore } from '../fileStore'
import { useEditorStore } from '../editorStore'
import { useGitReposStore } from '../gitReposStore'
import { useGitStore } from '../gitStore'
import { useGitSettingsStore } from '../gitSettingsStore'
import type { FileNode } from '@/types/index'

const mockTree: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true },
  { name: 'package.json', path: '/proj/package.json', isDirectory: false },
]

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

vi.stubGlobal('window', {
  api: {
    openFolder: vi.fn().mockResolvedValue('/proj'),
    readDir: vi.fn().mockResolvedValue(mockTree),
    gitWatchRoot: vi.fn(),
    fsWatchRoot: vi.fn(),
    recentProjectsAdd: vi.fn(),
    setWindowTitle: vi.fn(),
    gitDiscoverRepos: vi.fn().mockResolvedValue(['/proj']),
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(null),
    gitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [] }),
    gitListIgnored: vi.fn().mockResolvedValue([]),
  },
})

describe('fileStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.openFolder).mockResolvedValue('/proj')
    vi.mocked(window.api.readDir).mockResolvedValue(mockTree)
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValue(['/proj'])
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useFileStore.setState({ projectRoot: null, tree: [], selectedPath: null, expandedPaths: new Set(), revealedPath: null })
    useGitReposStore.setState({ repos: [], selectedRepo: null })
    useGitStore.setState({ repos: {} })
    useEditorStore.getState().resetForNewProject()
  })

  it('starts empty', () => {
    const { projectRoot, tree, selectedPath } = useFileStore.getState()
    expect(projectRoot).toBeNull()
    expect(tree).toHaveLength(0)
    expect(selectedPath).toBeNull()
  })

  it('openFolder sets root and loads tree', async () => {
    await useFileStore.getState().openFolder()
    const { projectRoot, tree } = useFileStore.getState()
    expect(projectRoot).toBe('/proj')
    expect(tree).toEqual(mockTree)
  })

  it('openFolder does nothing if dialog is cancelled', async () => {
    vi.mocked(window.api.openFolder).mockResolvedValueOnce(null)
    await useFileStore.getState().openFolder()
    expect(useFileStore.getState().projectRoot).toBeNull()
  })

  it('openFolder closes tabs left over from the previous project', async () => {
    await useFileStore.getState().openFolder()
    useEditorStore.getState().openTab({ path: '/proj/a.ts', content: '', dirty: false })
    expect(useEditorStore.getState().tabs).toHaveLength(1)

    vi.mocked(window.api.openFolder).mockResolvedValueOnce('/other-proj')
    vi.mocked(window.api.readDir).mockResolvedValueOnce([])
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce(['/other-proj'])
    await useFileStore.getState().openFolder()

    expect(useFileStore.getState().projectRoot).toBe('/other-proj')
    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })

  it('openFolder in the single-repo case discovers just the root and selects it', async () => {
    await useFileStore.getState().openFolder()
    expect(window.api.gitDiscoverRepos).toHaveBeenCalledWith('/proj', 4)
    expect(useGitReposStore.getState().repos).toEqual(['/proj'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj')
    expect(window.api.gitWatchRoot).toHaveBeenCalledWith('/proj')
  })

  it('openFolder passes the configured repo scan depth through to discovery', async () => {
    useGitSettingsStore.getState().setRepoScanDepth(7)
    await useFileStore.getState().openFolder()
    expect(window.api.gitDiscoverRepos).toHaveBeenCalledWith('/proj', 7)
    useGitSettingsStore.getState().setRepoScanDepth(4)
  })

  it('openFolder in the multi-repo case discovers every sibling repo and selects the first', async () => {
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce(['/proj/repoA', '/proj/repoB'])
    await useFileStore.getState().openFolder()
    expect(useGitReposStore.getState().repos).toEqual(['/proj/repoA', '/proj/repoB'])
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
    expect(window.api.gitWatchRoot).toHaveBeenCalledWith('/proj/repoA')
  })

  it('openFolder only fetches the selected repo up front, leaving the rest unloaded', async () => {
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce(['/proj/repoA', '/proj/repoB'])
    await useFileStore.getState().openFolder()
    expect(window.api.gitBranch).toHaveBeenCalledWith('/proj/repoA')
    expect(window.api.gitBranch).not.toHaveBeenCalledWith('/proj/repoB')
    expect(useGitStore.getState().repos['/proj/repoA'].branch).toBe('main')
    expect(useGitStore.getState().repos['/proj/repoB']).toBeUndefined()
  })

  it('openFolder with zero discovered repos clears the repo selection', async () => {
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce([])
    await useFileStore.getState().openFolder()
    expect(useGitReposStore.getState().repos).toEqual([])
    expect(useGitReposStore.getState().selectedRepo).toBeNull()
    expect(window.api.gitWatchRoot).toHaveBeenCalledWith(null)
  })

  it('openRecentProject sets root and loads tree without a dialog', async () => {
    vi.mocked(window.api.openFolder).mockClear()
    vi.mocked(window.api.readDir).mockResolvedValueOnce(mockTree)
    await useFileStore.getState().openRecentProject('/proj')
    const { projectRoot, tree } = useFileStore.getState()
    expect(projectRoot).toBe('/proj')
    expect(tree).toEqual(mockTree)
    expect(window.api.openFolder).not.toHaveBeenCalled()
    expect(window.api.recentProjectsAdd).toHaveBeenCalledWith('/proj')
  })

  it('openRecentProject closes tabs left over from the previous project', async () => {
    await useFileStore.getState().openFolder()
    useEditorStore.getState().openTab({ path: '/proj/a.ts', content: '', dirty: false })
    expect(useEditorStore.getState().tabs).toHaveLength(1)

    vi.mocked(window.api.readDir).mockResolvedValueOnce([])
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce(['/other-proj'])
    await useFileStore.getState().openRecentProject('/other-proj')

    expect(useFileStore.getState().projectRoot).toBe('/other-proj')
    expect(useEditorStore.getState().tabs).toHaveLength(0)
  })

  it('expandDir updates the matching node children in the tree and marks it expanded', async () => {
    useFileStore.setState({ tree: mockTree })
    const children: FileNode[] = [
      { name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false },
    ]
    vi.mocked(window.api.readDir).mockResolvedValueOnce(children)
    await useFileStore.getState().expandDir('/proj/src')
    const srcNode = useFileStore.getState().tree.find((n) => n.path === '/proj/src')
    expect(srcNode?.children).toEqual(children)
    expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(true)
  })

  it('collapseDir removes the path from expandedPaths without touching cached children', async () => {
    useFileStore.setState({ tree: mockTree })
    vi.mocked(window.api.readDir).mockResolvedValueOnce([])
    await useFileStore.getState().expandDir('/proj/src')
    useFileStore.getState().collapseDir('/proj/src')
    expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(false)
  })

  it('collapseAll clears every expanded path', async () => {
    useFileStore.setState({ tree: mockTree })
    vi.mocked(window.api.readDir).mockResolvedValue([])
    await useFileStore.getState().expandDir('/proj/src')
    useFileStore.getState().collapseAll()
    expect(useFileStore.getState().expandedPaths.size).toBe(0)
  })

  it('refreshTree reloads the root and every expanded directory, preserving expansion', async () => {
    useFileStore.setState({ projectRoot: '/proj', tree: mockTree, expandedPaths: new Set() })
    vi.mocked(window.api.readDir).mockResolvedValueOnce([
      { name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false },
    ])
    await useFileStore.getState().expandDir('/proj/src')

    const freshRoot: FileNode[] = [
      { name: 'src', path: '/proj/src', isDirectory: true },
      { name: 'new-file.ts', path: '/proj/new-file.ts', isDirectory: false },
    ]
    const freshChildren: FileNode[] = [
      { name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false },
      { name: 'new-child.ts', path: '/proj/src/new-child.ts', isDirectory: false },
    ]
    vi.mocked(window.api.readDir).mockResolvedValueOnce(freshRoot)
    vi.mocked(window.api.readDir).mockResolvedValueOnce(freshChildren)

    await useFileStore.getState().refreshTree()

    const { tree, expandedPaths } = useFileStore.getState()
    expect(tree.map((n) => n.name)).toEqual(['src', 'new-file.ts'])
    expect(tree.find((n) => n.path === '/proj/src')?.children).toEqual(freshChildren)
    expect(expandedPaths.has('/proj/src')).toBe(true)
  })

  it('refreshTree drops expanded directories that no longer exist', async () => {
    useFileStore.setState({ projectRoot: '/proj', tree: mockTree, expandedPaths: new Set() })
    vi.mocked(window.api.readDir).mockResolvedValueOnce([])
    await useFileStore.getState().expandDir('/proj/src')

    vi.mocked(window.api.readDir).mockResolvedValueOnce(mockTree)
    vi.mocked(window.api.readDir).mockRejectedValueOnce(new Error('ENOENT'))

    await useFileStore.getState().refreshTree()

    expect(useFileStore.getState().expandedPaths.has('/proj/src')).toBe(false)
  })

  it('select sets selectedPath', () => {
    useFileStore.getState().select('/proj/package.json')
    expect(useFileStore.getState().selectedPath).toBe('/proj/package.json')
  })

  it('setRevealedPath sets revealedPath', () => {
    useFileStore.getState().setRevealedPath('/proj/package.json')
    expect(useFileStore.getState().revealedPath).toBe('/proj/package.json')
  })

  it('clearRevealedPath resets revealedPath to null', () => {
    useFileStore.getState().setRevealedPath('/proj/package.json')
    useFileStore.getState().clearRevealedPath()
    expect(useFileStore.getState().revealedPath).toBeNull()
  })

  it('openProjectAt sets root and tree from the given path without opening a picker dialog', async () => {
    vi.mocked(window.api.readDir).mockResolvedValueOnce(mockTree)
    vi.mocked(window.api.gitDiscoverRepos).mockResolvedValueOnce(['/other-proj'])
    await useFileStore.getState().openProjectAt('/other-proj')
    const { projectRoot, tree } = useFileStore.getState()
    expect(projectRoot).toBe('/other-proj')
    expect(tree).toEqual(mockTree)
    expect(window.api.gitWatchRoot).toHaveBeenCalledWith('/other-proj')
  })

  it('openProjectAt does not write to localStorage (each window keeps its own project)', async () => {
    vi.mocked(window.api.readDir).mockResolvedValueOnce(mockTree)
    await useFileStore.getState().openProjectAt('/other-proj')
    expect(localStorage.getItem('vide:lastProjectRoot')).toBeNull()
  })

  it('closeProject drops back to the no-project state', async () => {
    await useFileStore.getState().openFolder()
    useFileStore.getState().closeProject()
    const { projectRoot, tree, selectedPath, expandedPaths } = useFileStore.getState()
    expect(projectRoot).toBeNull()
    expect(tree).toHaveLength(0)
    expect(selectedPath).toBeNull()
    expect(expandedPaths.size).toBe(0)
  })

  it('closeProject clears tabs, repos, and unwatches fs/git', async () => {
    await useFileStore.getState().openFolder()
    useEditorStore.getState().openTab({ path: '/proj/a.ts', content: '', dirty: false })
    useFileStore.getState().closeProject()
    expect(useEditorStore.getState().tabs).toHaveLength(0)
    expect(useGitReposStore.getState().repos).toEqual([])
    expect(window.api.fsWatchRoot).toHaveBeenCalledWith(null)
    expect(window.api.gitWatchRoot).toHaveBeenCalledWith(null)
  })

  it('closeProject leaves the persisted last-project preference alone (soft reset only)', async () => {
    await useFileStore.getState().openFolder()
    useFileStore.getState().closeProject()
    expect(localStorage.getItem('vide:lastProjectRoot')).toBe('/proj')
  })
})
