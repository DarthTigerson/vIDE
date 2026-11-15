import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'

const { openTab, openUrlInBrowserTab } = vi.hoisted(() => ({ openTab: vi.fn(), openUrlInBrowserTab: vi.fn() }))
vi.mock('@/stores/editorStore', () => ({
  useEditorStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}))
vi.mock('@/components/Chat/terminalLinks', () => ({ openUrlInBrowserTab }))

import { StorePage } from '../StorePage'
import { useStoreStore } from '@/stores/storeStore'
import { useAppContribStore } from '@/apps/appContribStore'
import type { AppInfo } from '@/types/api'
import type { RegistryState, StoreListing } from '@/types/api'

function listing(id: string, name: string, description: string, extra: Partial<StoreListing> = {}): StoreListing {
  return {
    id, name, description, repo: `o/${id}`, firstParty: true, compatible: true,
    recommended: false, category: 'applications', targets: ['vide'], ...extra,
    latest: { version: '1.0.0', commit: 'a'.repeat(40), url: 'https://x', sha256: 'b'.repeat(64), minVide: '0.4.0' },
  }
}

const ok: RegistryState = {
  status: 'ok', checkedAt: Date.now(), fromCache: false,
  apps: [listing('docker', 'Docker', 'Containers from the sidebar.'), listing('jira', 'Jira', 'Issues next to your code.')],
}

const load = vi.fn().mockResolvedValue(undefined)

function setRegistry(registry: RegistryState | null, loading = false) {
  useStoreStore.setState({ registry, loading, load })
}

const appsInstall = vi.fn()
const appsRestart = vi.fn()
function inst(id: string, version: string, extra: Partial<AppInfo> = {}): AppInfo {
  return { id, name: id, version, source: 'store', rendererUrl: '', hasMain: false, contributes: {}, status: 'loaded', ...extra }
}

beforeEach(() => {
  ;(window as any).api = { appsInstall, appsRestart }
  useAppContribStore.setState({ apps: [], panels: {} })
  useStoreStore.setState({ busy: {}, errors: {} })
  setRegistry(ok)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StorePage', () => {
  it('shows a loading line before the first result', () => {
    setRegistry(null, true)
    render(<StorePage />)
    expect(screen.getByText('Loading the Store…')).toBeInTheDocument()
  })

  it('renders one row per app', () => {
    render(<StorePage />)
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jira' })).toBeInTheDocument()
  })

  it('lists recommended apps first', () => {
    setRegistry({ ...ok, apps: [listing('a', 'Alpha', 'x'), listing('z', 'Zed', 'y', { recommended: true })] } as RegistryState)
    render(<StorePage />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent).filter((t) => t === 'Alpha' || t === 'Zed')).toEqual(['Zed', 'Alpha'])
  })

  it('has an Agent tools category and opens preset to it', () => {
    const tool = listing('ddg', 'DuckDuckGo', 'Web search.', { category: 'agent-tools' })
    setRegistry({ ...ok, apps: [...ok.apps, tool] } as RegistryState)
    useStoreStore.setState({ presetCategory: 'agent-tools' })
    render(<StorePage />)
    expect(screen.getByRole('button', { name: /^Agent tools/ }).textContent).toBe('Agent tools1')
    expect(screen.getByRole('button', { name: /^Agent tools/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'DuckDuckGo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Docker' })).toBeNull()
    expect(useStoreStore.getState().presetCategory).toBeNull()
  })

  it('shows the site filters in order with counts', () => {
    render(<StorePage />)
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles.slice(0, 3)).toEqual(['Category', 'Made by', 'Applications'])
    expect(screen.getByRole('button', { name: /^Community/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Made by vSuite/ }).textContent).toBe('Made by vSuite2')
    expect(screen.getByRole('checkbox', { name: 'vIDE' })).toBeChecked()
  })

  it('filters by Made by and clears back to the defaults', () => {
    render(<StorePage />)
    const clear = screen.getByRole('button', { name: 'Clear filters' })
    expect(clear).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /^Community/ }))
    expect(screen.queryByRole('heading', { name: 'Docker' })).toBeNull()
    expect(screen.getByText(/No apps match/)).toBeInTheDocument()
    fireEvent.click(clear)
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
  })

  it('hides apps for other applications until vIDE is unticked', () => {
    setRegistry({ ...ok, apps: [listing('docker', 'Docker', 'x'), listing('web', 'Web only', 'y', { targets: ['site'] })] } as RegistryState)
    render(<StorePage />)
    expect(screen.queryByRole('heading', { name: 'Web only' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'vIDE' }))
    expect(screen.getByRole('heading', { name: 'Web only' })).toBeInTheDocument()
  })

  it('filters by search and says when nothing matches', () => {
    render(<StorePage />)
    fireEvent.change(screen.getByLabelText('Search the store'), { target: { value: 'doc' } })
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jira' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Search the store'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No apps match\./)).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    setRegistry({ status: 'empty', checkedAt: Date.now() })
    render(<StorePage />)
    expect(screen.getByText('No apps yet.')).toBeInTheDocument()
  })

  it('asks for a vIDE update on a too-new catalog', () => {
    setRegistry({ status: 'too-new' })
    render(<StorePage />)
    expect(screen.getByText('Update vIDE to use the Store')).toBeInTheDocument()
  })

  it('shows the error with a Retry that refreshes', () => {
    setRegistry({ status: 'error', message: "Couldn't reach the Store. Check your connection." })
    render(<StorePage />)
    expect(screen.getByText("Couldn't reach the Store. Check your connection.")).toBeInTheDocument()
    load.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(load).toHaveBeenCalledWith(true)
  })

  it('marks an offline copy in the footer', () => {
    setRegistry({ ...ok, fromCache: true } as RegistryState)
    render(<StorePage />)
    expect(screen.getByText(/\(offline copy\)/)).toBeInTheDocument()
  })

  it('opens the app page from a card', () => {
    render(<StorePage />)
    expect(screen.queryByRole('button', { name: 'View Docker' })).toBeNull()
    fireEvent.click(screen.getByRole('heading', { name: 'Docker' }))
    expect(openTab).toHaveBeenCalledWith({ path: 'store://app/docker', content: '', dirty: false })
  })

  it('refreshes the catalog from the refresh button', async () => {
    await act(async () => { render(<StorePage />) })
    load.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Check for new apps' }))
    expect(load).toHaveBeenCalledWith(true)
  })

  it('loads on mount and refreshes in the background when a result already exists', async () => {
    await act(async () => { render(<StorePage />) })
    expect(load).toHaveBeenNthCalledWith(1, false)
    expect(load).toHaveBeenNthCalledWith(2, true)
  })

  it('does not double-fetch on first open', async () => {
    setRegistry(null)
    await act(async () => { render(<StorePage />) })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(false)
  })

  it('Install calls appsInstall and shows Installing... while pending', async () => {
    let done: (v: { ok: true }) => void = () => {}
    appsInstall.mockReturnValue(new Promise((r) => { done = r }))
    render(<StorePage />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Install' })[0])
    expect(appsInstall).toHaveBeenCalledWith('docker')
    expect(await screen.findByRole('button', { name: 'Installing…' })).toBeDisabled()
    await act(async () => { done({ ok: true }) })
    expect(screen.queryByRole('button', { name: 'Installing…' })).toBeNull()
  })

  it('shows an install error in the row', async () => {
    appsInstall.mockResolvedValue({ ok: false, error: 'Checksum mismatch' })
    render(<StorePage />)
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Install' })[0]) })
    expect(screen.getByText('Checksum mismatch')).toBeInTheDocument()
  })

  it('counts and filters Installed and Updates', () => {
    setRegistry({ ...ok, apps: [{ ...listing('docker', 'Docker', 'x'), latest: { version: '1.1.0', commit: 'a'.repeat(40), url: 'u', sha256: 'b'.repeat(64), minVide: '0.4.0' } }, listing('jira', 'Jira', 'y')] } as RegistryState)
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0')] })
    render(<StorePage />)
    expect(screen.getByRole('button', { name: /^Updates/ }).textContent).toBe('Updates 1')
    expect(screen.getByRole('button', { name: /^Installed/ }).textContent).toBe('Installed 1')
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Updates/ }))
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jira' })).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: /^All/ }))
    expect(screen.getByRole('heading', { name: 'Jira' })).toBeInTheDocument()
  })

  it('does not count a restart-required app as an update', () => {
    setRegistry({ ...ok, apps: [{ ...listing('docker', 'Docker', 'x'), latest: { version: '1.1.0', commit: 'a'.repeat(40), url: 'u', sha256: 'b'.repeat(64), minVide: '0.4.0' } }] } as RegistryState)
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0', { status: 'restart-required' })] })
    render(<StorePage />)
    expect(screen.getByRole('button', { name: /^Updates/ }).textContent).toBe('Updates 0')
  })

  it('an installed app shows Uninstall (no View/Open) and confirms before uninstalling', async () => {
    const appsUninstall = vi.fn().mockResolvedValue({ ok: true })
    ;(window as any).api.appsUninstall = appsUninstall
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0')] })
    render(<StorePage />)
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^View/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    expect(screen.getByText('Uninstall Docker?')).toBeInTheDocument()
    expect(appsUninstall).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Uninstall' }).pop()!) })
    expect(appsUninstall).toHaveBeenCalledWith('docker')
  })

  it('right-click on an installed app offers Favorite, Settings, Disable and Uninstall', async () => {
    const appsSetEnabled = vi.fn().mockResolvedValue({ ok: true })
    ;(window as any).api.appsSetEnabled = appsSetEnabled
    useAppContribStore.setState({
      apps: [inst('docker', '1.0.0')],
      panels: { docker: { appId: 'docker', title: 'Docker', icon: () => null, component: () => null, requiresProject: false } },
      settingsPages: { docker: { appId: 'docker', title: 'Docker', component: () => null } },
    })
    render(<StorePage />)
    fireEvent.contextMenu(screen.getByRole('heading', { name: 'Docker' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('button', { name: 'Favorite' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Uninstall' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(within(menu).getByRole('button', { name: 'Disable' })) })
    expect(appsSetEnabled).toHaveBeenCalledWith('docker', false)
  })

  it('a disabled app shows a Disabled tag and Enable in its menu, without Favorite or Settings', () => {
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0', { status: 'disabled' })] })
    render(<StorePage />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('heading', { name: 'Docker' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: 'Disable' })).toBeNull()
    expect(within(menu).queryByRole('button', { name: 'Favorite' })).toBeNull()
    expect(within(menu).queryByRole('button', { name: 'Settings' })).toBeNull()
  })

  it('has no right-click menu for an app that is not installed', () => {
    render(<StorePage />)
    fireEvent.contextMenu(screen.getByRole('heading', { name: 'Docker' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('shows Restart to finish for a restart-required app and restarts', () => {
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0', { status: 'restart-required' })] })
    render(<StorePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Restart to finish' }))
    expect(appsRestart).toHaveBeenCalled()
  })

  it('shows Failed to load with the error as title, and Needs vIDE', () => {
    setRegistry({ ...ok, apps: [listing('docker', 'Docker', 'x'), listing('jira', 'Jira', 'y', { compatible: false })] } as RegistryState)
    useAppContribStore.setState({ apps: [inst('docker', '1.0.0', { status: 'failed', error: 'boom' })] })
    render(<StorePage />)
    expect(screen.getByText('Failed to load')).toHaveAttribute('title', 'boom')
    expect(screen.getByText('Needs vIDE 0.4.0')).toBeInTheDocument()
  })

  it('lists dev apps under "Loaded from folder" and never counts them as installed', () => {
    useAppContribStore.setState({ apps: [inst('hello', '0.1.0', { name: 'Hello', source: 'dev' })] })
    render(<StorePage />)
    expect(screen.getByText('Loaded from folder')).toBeInTheDocument()
    expect(screen.getByText('Dev')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Installed/ }).textContent).toContain('0')
  })
})
