import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const { openTab, openUrlInBrowserTab } = vi.hoisted(() => ({ openTab: vi.fn(), openUrlInBrowserTab: vi.fn() }))
vi.mock('@/stores/editorStore', () => ({
  useEditorStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}))
vi.mock('@/components/Chat/terminalLinks', () => ({ openUrlInBrowserTab }))

import { LanguageServerPage } from '../LanguageServerPage'
import { useStoreStore } from '@/stores/storeStore'
import { useLspStatusStore } from '@/stores/lspStatusStore'
import type { LanguageServerEntry, RegistryState } from '@/types/api'

const pyright: LanguageServerEntry = {
  id: 'python', name: 'Python', description: 'Pyright: go to definition for Python.', author: 'Microsoft', version: '1.1.414',
  targets: ['vide'], languages: ['python'], binary: 'pyright-langserver', args: ['--stdio'], versionArgs: ['--version'],
  ramEstimate: 'typically 200–500MB', homepage: 'https://github.com/microsoft/pyright',
  install: { method: 'npm', packages: ['pyright'] },
}

beforeEach(() => {
  ;(window as any).api = {
    lspInstall: vi.fn().mockResolvedValue(true), lspUninstall: vi.fn(), lspSetEnabled: vi.fn(),
    lspListInstalled: vi.fn().mockResolvedValue([]), onLspChanged: vi.fn(() => () => {}), onLspInstallData: vi.fn(() => () => {}),
  }
  const registry: RegistryState = { status: 'ok', checkedAt: Date.now(), fromCache: false, apps: [], languageServers: [pyright] }
  useStoreStore.setState({ registry, loading: false, load: vi.fn().mockResolvedValue(undefined) })
  useLspStatusStore.setState({ installed: [], installing: {}, installOutput: {}, installFailed: {} })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('LanguageServerPage', () => {
  it('shows who makes it, the install source, memory and the latest version', async () => {
    await act(async () => { render(<LanguageServerPage serverId="python" />) })
    expect(screen.getByRole('heading', { name: 'Python' })).toBeInTheDocument()
    expect(screen.getByText('Language server · by Microsoft')).toBeInTheDocument()
    expect(screen.getByText('npm install -g pyright')).toBeInTheDocument()
    expect(screen.getByText('typically 200–500MB')).toBeInTheDocument()
    expect(screen.getByText('1.1.414')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Homepage' }))
    expect(openUrlInBrowserTab).toHaveBeenCalledWith('https://github.com/microsoft/pyright')
  })

  it('says so when the catalog does not list the id', async () => {
    await act(async () => { render(<LanguageServerPage serverId="cobol" />) })
    expect(screen.getByText('Language server not found in the Store.')).toBeInTheDocument()
  })
})
