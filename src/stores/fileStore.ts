import { create } from 'zustand'
import type { FileNode } from '@/types/index'
import { useEditorStore } from './editorStore'
import { useGitReposStore } from './gitReposStore'
import { useGitStore } from './gitStore'
import { useGitSettingsStore } from './gitSettingsStore'

function setNodeChildren(
  nodes: FileNode[],
  targetPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return { ...node, children }
    if (node.isDirectory && node.children) {
      return { ...node, children: setNodeChildren(node.children, targetPath, children) }
    }
    return node
  })
}

const LAST_ROOT_KEY = 'vide:lastProjectRoot'

interface FileState {
  projectRoot: string | null
  tree: FileNode[]
  selectedPath: string | null
  expandedPaths: Set<string>
  revealedPath: string | null
  setRevealedPath: (path: string) => void
  clearRevealedPath: () => void
  restoreRoot: () => Promise<void>
  openFolder: () => Promise<void>
  openProjectAt: (root: string) => Promise<void>
  refreshTree: () => Promise<void>
  expandDir: (dirPath: string) => Promise<void>
  collapseDir: (dirPath: string) => void
  collapseAll: () => void
  select: (path: string) => void
  openRecentProject: (root: string) => Promise<void>
  closeProject: () => void
}

export const useFileStore = create<FileState>((set, get) => {
  // Shared by openFolder (root chosen via dialog) and openRecentProject (root
  // chosen from the Recent Projects palette) — both replace this window's
  // project the same way: fresh tree, tabs reset, root persisted/watched.
  const switchToProject = async (root: string) => {
    const tree = await window.api.readDir(root)
    const previousRoot = get().projectRoot
    localStorage.setItem(LAST_ROOT_KEY, root)
    set({ projectRoot: root, tree, expandedPaths: new Set() })
    await discoverAndWatchRepos(root)
    window.api.fsWatchRoot(root)
    window.api.recentProjectsAdd(root)
    window.api.setWindowTitle(root)
    if (previousRoot !== null && previousRoot !== root) {
      useEditorStore.getState().resetForNewProject()
    }
  }

  // Shared by every place a project root gets set (dialog pick, recent
  // project, restore-on-launch, "open in new window"): discovers the repo
  // set for the new root (recursively, per the configured scan depth),
  // tells gitReposStore about it (which auto-selects), points the git file
  // watcher at whichever repo ends up selected instead of always the
  // project root, and fetches just that one repo up front. The rest stay
  // unloaded (name-only) until something actually needs them — RepoSelect/
  // RepoOverviewList fetch on demand — so opening a project with many
  // nested repos doesn't fire a git status/branch call per repo.
  const discoverAndWatchRepos = async (root: string) => {
    const depth = useGitSettingsStore.getState().repoScanDepth
    const repos = await window.api.gitDiscoverRepos(root, depth)
    useGitReposStore.getState().setRepos(repos)
    const selected = useGitReposStore.getState().selectedRepo
    window.api.gitWatchRoot(selected)
    if (selected) await useGitStore.getState().refresh(selected)
  }

  return {
  projectRoot: null,
  tree: [],
  selectedPath: null,
  expandedPaths: new Set(),
  revealedPath: null,

  restoreRoot: async () => {
    const lastRoot = localStorage.getItem(LAST_ROOT_KEY)
    if (!lastRoot) return
    try {
      const tree = await window.api.readDir(lastRoot)
      set({ projectRoot: lastRoot, tree, expandedPaths: new Set() })
      await discoverAndWatchRepos(lastRoot)
      window.api.fsWatchRoot(lastRoot)
      window.api.setWindowTitle(lastRoot)
    } catch {
      localStorage.removeItem(LAST_ROOT_KEY)
    }
  },

  // Re-fetches the root listing and every currently-expanded directory, so a
  // change anywhere in the tree (including ones made outside the app) shows
  // up without collapsing folders the user already had open. Directories
  // that no longer exist are silently dropped from the expanded set.
  refreshTree: async () => {
    const { projectRoot, expandedPaths } = get()
    if (!projectRoot) return
    let tree = await window.api.readDir(projectRoot)

    const stillExpanded = new Set<string>()
    const byDepth = Array.from(expandedPaths).sort((a, b) => a.length - b.length)
    for (const dirPath of byDepth) {
      try {
        const children = await window.api.readDir(dirPath)
        tree = setNodeChildren(tree, dirPath, children)
        stillExpanded.add(dirPath)
      } catch {
        // directory was deleted/renamed externally — drop it
      }
    }
    set({ tree, expandedPaths: stillExpanded })
  },

  openFolder: async () => {
    const root = await window.api.openFolder()
    if (!root) return
    await switchToProject(root)
  },

  openRecentProject: async (root: string) => {
    await switchToProject(root)
  },

  openProjectAt: async (root: string) => {
    const tree = await window.api.readDir(root)
    set({ projectRoot: root, tree, expandedPaths: new Set() })
    await discoverAndWatchRepos(root)
    window.api.fsWatchRoot(root)
    window.api.setWindowTitle(root)
  },

  expandDir: async (dirPath: string) => {
    const children = await window.api.readDir(dirPath)
    set((state) => ({
      tree: setNodeChildren(state.tree, dirPath, children),
      expandedPaths: new Set(state.expandedPaths).add(dirPath),
    }))
  },

  collapseDir: (dirPath: string) => {
    set((state) => {
      const next = new Set(state.expandedPaths)
      next.delete(dirPath)
      return { expandedPaths: next }
    })
  },

  collapseAll: () => set({ expandedPaths: new Set() }),

  select: (path: string) => set({ selectedPath: path }),

  // Purpose-built for "Reveal in File Tree" — deliberately separate from
  // selectedPath (dead state, never read) and from FileTree's activeFilePath
  // highlight (tracks the open editor tab): this just marks a location to
  // flash a ring around once its ancestor directories are expanded, cleared
  // the moment the user next interacts with the tree.
  setRevealedPath: (path: string) => set({ revealedPath: path }),
  clearRevealedPath: () => set({ revealedPath: null }),

  // "Soft" reset — drops back to the Select-a-project screen for this
  // window only. Deliberately leaves LAST_ROOT_KEY untouched, so a normal
  // relaunch still restores whatever project was open; this is just for
  // things like re-running the setup wizard against a clean slate.
  closeProject: () => {
    window.api.fsWatchRoot(null)
    window.api.gitWatchRoot(null)
    useGitReposStore.getState().setRepos([])
    useEditorStore.getState().resetForNewProject()
    set({ projectRoot: null, tree: [], selectedPath: null, expandedPaths: new Set(), revealedPath: null })
  },
  }
})
