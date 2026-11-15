import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const { openTab, openUrlInBrowserTab } = vi.hoisted(() => ({ openTab: vi.fn(), openUrlInBrowserTab: vi.fn() }))
vi.mock('@/stores/editorStore', () => ({
  useEditorStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}))
vi.mock('@/components/Chat/terminalLinks', () => ({ openUrlInBrowserTab }))

import { StorePage } from '../StorePage'
import { useStoreStore } from '@/stores/storeStore'
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

beforeEach(() => setRegistry(ok))
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
    fireEvent.click(screen.getByRole('button', { name: 'View Docker' }))
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
})
