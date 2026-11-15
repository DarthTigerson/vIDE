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

function listing(id: string, name: string, description: string): StoreListing {
  return {
    id, name, description, repo: `o/${id}`, firstParty: true, compatible: true,
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

  it('renders one card per app plus the Built something card', () => {
    render(<StorePage />)
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jira' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Built something?' })).toBeInTheDocument()
  })

  it('filters by search and says when nothing matches', () => {
    render(<StorePage />)
    fireEvent.change(screen.getByLabelText('Search the store'), { target: { value: 'doc' } })
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jira' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Search the store'), { target: { value: 'zzz' } })
    expect(screen.getByText('No apps match.')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    setRegistry({ status: 'empty', checkedAt: Date.now() })
    render(<StorePage />)
    expect(screen.getByText('No apps yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Built something?' })).toBeInTheDocument()
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

  it('opens vsuite.tech in a vIDE browser tab', () => {
    render(<StorePage />)
    fireEvent.click(screen.getByRole('button', { name: 'vsuite.tech' }))
    expect(openUrlInBrowserTab).toHaveBeenCalledWith('https://vsuite.tech')
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
