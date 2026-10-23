/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useFileClipboardStore } from '@/stores/fileClipboardStore'
import { useTreeHidingStore, selectRules } from '@/stores/treeHidingStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { DEFAULT_HIDE_RULES, repoKey, type RepoHideRules } from '@/lib/treeHiding'
import type { FileNode } from '@/types/index'

const srcChildren: FileNode[] = [{ name: 'App.tsx', path: '/proj/src/App.tsx', isDirectory: false }]
const rootTree: FileNode[] = [
  { name: 'src', path: '/proj/src', isDirectory: true, children: srcChildren },
  { name: 'util.ts', path: '/proj/util.ts', isDirectory: false },
  { name: 'Makefile', path: '/proj/Makefile', isDirectory: false },
]

function rules(): RepoHideRules {
  return selectRules(useTreeHidingStore.getState().byRepo, '/proj')
}
function setRules(r: Partial<RepoHideRules>) {
  useTreeHidingStore.setState({ byRepo: { [repoKey('/proj')]: { ...DEFAULT_HIDE_RULES, ...r } } })
}

beforeEach(() => {
  try { localStorage.clear() } catch {}
  useTreeHidingStore.setState({ byRepo: {} })
  useGraphifySettingsStore.setState({ enabled: false } as any)
  useFileClipboardStore.getState().clear()
  ;(global as any).window.api = {
    readDir: vi.fn(async (dir: string) => (dir === '/proj' ? rootTree : dir === '/proj/src' ? srcChildren : [])),
    readClipboardFiles: vi.fn().mockResolvedValue(null),
    writeClipboardFiles: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    gitWatchRoot: vi.fn(),
    fsWatchRoot: vi.fn(),
  }
  useFileStore.setState({
    projectRoot: '/proj',
    tree: rootTree,
    expandedPaths: new Set(['/proj/src']),
    selectedPath: null,
    revealedPath: null,
  })
  useEditorStore.setState({ activeTabPath: null } as any)
  useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, ignoredPaths: [] } } })
})
afterEach(() => cleanup())

const nodeEl = (c: HTMLElement, path: string) =>
  c.querySelector(`[id="file-tree-node:${path}"]`) as HTMLElement

function openHide(c: HTMLElement, path: string) {
  fireEvent.contextMenu(nodeEl(c, path))
  fireEvent.mouseEnter(screen.getByText('Hide').closest('div')!)
}

describe('Sidebar — Hide submenu', () => {
  it('Hide "name" stores the repo-relative path and closes the menu', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/src/App.tsx')
    fireEvent.click(screen.getByText('Hide "App.tsx"'))
    expect(rules().paths).toEqual(['src/App.tsx'])
    expect(screen.queryByText('Move to Trash')).toBeNull()
  })

  it('Hide all named hides by name', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/Makefile')
    fireEvent.click(screen.getByText('Hide all named "Makefile"'))
    expect(rules().names).toEqual(['Makefile'])
  })

  it('Hide all .ts files is offered for files with an extension', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/util.ts')
    fireEvent.click(screen.getByText('Hide all .ts files'))
    expect(rules().extensions).toEqual(['ts'])
  })

  it('no extension entry for a file without an extension', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/Makefile')
    expect(screen.queryByText(/Hide all \./)).toBeNull()
  })

  it('folders get "Hide all folders named" and no extension entry', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/src')
    expect(screen.getByText('Hide all folders named "src"')).toBeInTheDocument()
    expect(screen.queryByText(/Hide all named/)).toBeNull()
    expect(screen.queryByText(/Hide all \./)).toBeNull()
    fireEvent.click(screen.getByText('Hide all folders named "src"'))
    expect(rules().names).toEqual(['src'])
  })

  it('a hidden row shows Unhide, which removes the rule', () => {
    setRules({ paths: ['util.ts'], showHidden: true })
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/util.ts')
    expect(screen.queryByText('Hide "util.ts"')).toBeNull()
    fireEvent.click(screen.getByText('Unhide "util.ts"'))
    expect(rules().paths).toEqual([])
  })

  it('a switch reads on = hidden, flips the toggle, and keeps the menu open', () => {
    const { container } = render(<Sidebar />)
    openHide(container, '/proj/util.ts')
    // Defaults: hidden items are hidden; dotfiles show.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Hidden items' })).toHaveAttribute('aria-checked', 'true')
    const sw = screen.getByRole('menuitemcheckbox', { name: 'Dotfiles' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(rules().showDotfiles).toBe(false)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Dotfiles' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Move to Trash')).toBeInTheDocument()
  })

  it('Graphify output switch only appears when graphify is enabled and the repo has graphify-out', () => {
    const graphifyOut: FileNode = { name: 'graphify-out', path: '/proj/graphify-out', isDirectory: true, children: [] }
    const shows = () => {
      const { container } = render(<Sidebar />)
      openHide(container, '/proj/util.ts')
      const present = screen.queryByRole('menuitemcheckbox', { name: 'Graphify output' }) !== null
      cleanup()
      return present
    }
    useFileStore.setState({ tree: [...rootTree, graphifyOut] })
    expect(shows()).toBe(false)
    useGraphifySettingsStore.setState({ enabled: true } as any)
    expect(shows()).toBe(true)
    useFileStore.setState({ tree: rootTree })
    expect(shows()).toBe(false)
  })
})

describe('Sidebar — hidden items eye button', () => {
  it('is absent without rules', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: /hidden items/i })).toBeNull()
  })

  it('shows the rule count and toggles showHidden', () => {
    setRules({ paths: ['a'], names: ['b'], extensions: ['c'] })
    render(<Sidebar />)
    const btn = screen.getByRole('button', { name: 'Show hidden items' })
    expect(btn).toHaveTextContent('3')
    fireEvent.click(btn)
    expect(rules().showHidden).toBe(true)
    expect(screen.getByRole('button', { name: 'Hide hidden items' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide hidden items' }))
    expect(rules().showHidden).toBe(false)
  })
})
