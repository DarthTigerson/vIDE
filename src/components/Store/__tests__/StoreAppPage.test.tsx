import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const { openTab, openUrlInBrowserTab } = vi.hoisted(() => ({ openTab: vi.fn(), openUrlInBrowserTab: vi.fn() }))
vi.mock('@/stores/editorStore', () => ({
  useEditorStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}))
vi.mock('@/components/Chat/terminalLinks', () => ({ openUrlInBrowserTab }))

import { StoreAppPage } from '../StoreAppPage'
import { useStoreStore } from '@/stores/storeStore'
import { useAppContribStore } from '@/apps/appContribStore'
import type { RegistryState, StoreListing } from '@/types/api'

const SHA = '0123456789abcdef0123456789abcdef01234567'

function docker(overrides: Partial<StoreListing> = {}, notesUrl: string | null = 'https://github.com/o/r/releases/tag/v1.1.0'): StoreListing {
  return {
    id: 'docker', name: 'Docker', description: 'Containers from the sidebar.', repo: 'DarthTigerson/vIDE---Docker-App',
    firstParty: true, compatible: true, recommended: false, category: 'applications', targets: ['vide'],
    latest: { version: '1.1.0', commit: SHA, url: 'https://x', sha256: 'b'.repeat(64), minVide: '0.4.0', notesUrl: notesUrl ?? undefined },
    ...overrides,
  }
}

const load = vi.fn().mockResolvedValue(undefined)
function setApps(apps: StoreListing[]) {
  const registry: RegistryState = { status: 'ok', checkedAt: Date.now(), fromCache: false, apps }
  useStoreStore.setState({ registry, loading: false, load })
}

const appsUninstall = vi.fn().mockResolvedValue({ ok: true })
beforeEach(() => {
  ;(window as any).api = { appsUninstall, appsInstall: vi.fn(), appsRestart: vi.fn() }
  useAppContribStore.setState({ apps: [], panels: {} })
  useStoreStore.setState({ busy: {}, errors: {} })
  setApps([docker()])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('StoreAppPage', () => {
  it('shows the app name, repo, version and short commit', () => {
    render(<StoreAppPage appId="docker" />)
    expect(screen.getByRole('heading', { name: 'Docker' })).toBeInTheDocument()
    expect(screen.getByText(/DarthTigerson\/vIDE---Docker-App/)).toBeInTheDocument()
    expect(screen.getByText("What's new in 1.1.0")).toBeInTheDocument()
    expect(screen.getByTitle(SHA).textContent).toBe('0123456')
    expect(screen.getByText('0.4.0 or newer')).toBeInTheDocument()
  })

  it('says when the id is not in the Store', () => {
    render(<StoreAppPage appId="nope" />)
    expect(screen.getByText('App not found in the Store.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← All apps' }))
    expect(openTab).toHaveBeenCalledWith({ path: 'store://Store', content: '', dirty: false })
  })

  it('hides the release-notes link when there is no notesUrl', () => {
    setApps([docker({}, null)])
    render(<StoreAppPage appId="docker" />)
    expect(screen.queryByRole('button', { name: 'Read release notes' })).toBeNull()
    expect(screen.getByText('No release notes for this version.')).toBeInTheDocument()
  })

  it('flags an app that needs a newer vIDE', () => {
    setApps([docker({ compatible: false })])
    render(<StoreAppPage appId="docker" />)
    expect(screen.getByText('0.4.0 or newer — update vIDE')).toBeInTheDocument()
  })

  it('opens release notes and source in vIDE browser tabs', () => {
    render(<StoreAppPage appId="docker" />)
    fireEvent.click(screen.getByRole('button', { name: 'Read release notes' }))
    expect(openUrlInBrowserTab).toHaveBeenCalledWith('https://github.com/o/r/releases/tag/v1.1.0')
    fireEvent.click(screen.getByRole('button', { name: 'View source' }))
    expect(openUrlInBrowserTab).toHaveBeenCalledWith('https://github.com/DarthTigerson/vIDE---Docker-App')
  })

  it('Uninstall confirms, then calls appsUninstall', async () => {
    useAppContribStore.setState({ apps: [{ id: 'docker', name: 'Docker', version: '1.1.0', source: 'store', rendererUrl: '', hasMain: false, status: 'loaded', contributes: { sidebarPanel: { title: 'Docker' }, settingsPage: { title: 'Docker' }, commands: true } }] })
    render(<StoreAppPage appId="docker" />)
    expect(screen.getByText('Installed')).toBeInTheDocument()
    expect(screen.getByText('Sidebar panel "Docker"')).toBeInTheDocument()
    expect(screen.getByText('Palette commands')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
    expect(screen.getByText('Uninstall Docker?')).toBeInTheDocument()
    expect(screen.getByText('Its settings stay, so reinstalling brings them back.')).toBeInTheDocument()
    expect(appsUninstall).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Uninstall' }).pop()!) })
    expect(appsUninstall).toHaveBeenCalledWith('docker')
  })

  it('shows Restart to finish for a restart-required app', () => {
    useAppContribStore.setState({ apps: [{ id: 'docker', name: 'Docker', version: '1.0.0', source: 'store', rendererUrl: '', hasMain: true, status: 'restart-required', contributes: {} }] })
    render(<StoreAppPage appId="docker" />)
    expect(screen.getByRole('button', { name: 'Restart to finish' })).toBeInTheDocument()
  })
})
