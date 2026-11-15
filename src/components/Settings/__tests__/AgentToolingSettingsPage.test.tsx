/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

const catalog = {
  todos: [{ name: 'start_todo', description: 'Start a ticket.' }, { name: 'get_todo', description: 'Read a ticket.' }],
  browser: [{ name: 'browser_click', description: 'Click.' }],
  notes: [{ name: 'read_note', description: 'Read a note.' }],
  scripts: [{ name: 'run_script', description: 'Run a script.' }],
  docs: [{ name: 'doc_outline', description: 'Outline.' }],
}
const api = {
  mcpCatalog: vi.fn(async () => catalog),
  todosMcpEnable: vi.fn(async () => {}),
  todosMcpDisable: vi.fn(async () => {}),
  notesMcpEnable: vi.fn(async () => {}),
  notesMcpDisable: vi.fn(async () => {}),
  browserMcpEnable: vi.fn(async () => {}),
  browserMcpDisable: vi.fn(async () => {}),
  scriptsMcpEnable: vi.fn(async () => {}),
  scriptsMcpDisable: vi.fn(async () => {}),
  appsSetEnabled: vi.fn(async () => ({ ok: true })),
}
;(window as unknown as { api: typeof api }).api = api

const { openTab } = vi.hoisted(() => ({ openTab: vi.fn() }))
vi.mock('@/stores/editorStore', () => ({
  useEditorStore: Object.assign(
    (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
    { getState: () => ({ openTab }) },
  ),
}))

import { AgentToolingSettingsPage } from '../AgentToolingSettingsPage'
import { useAppContribStore } from '@/apps/appContribStore'
import { useStoreStore } from '@/stores/storeStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import type { AppInfo } from '@/types/api'

function app(extra: Partial<AppInfo> = {}): AppInfo {
  return {
    id: 'duckduckgo', name: 'DuckDuckGo', version: '0.1.0', source: 'store', rendererUrl: '', hasMain: true, contributes: {}, status: 'loaded',
    agentTools: [{ name: 'web_search', description: 'Search the web.' }], ...extra,
  }
}

beforeEach(() => {
  useTodoMcpStore.setState({ enabled: true, pending: false, error: null })
  useAppContribStore.setState({ apps: [] })
  useStoreStore.setState({ registry: null, busy: {}, presetCategory: null })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AgentToolingSettingsPage', () => {
  it('lists the built-in servers with tool counts and an Always on label for docs', async () => {
    render(<AgentToolingSettingsPage />)
    const builtIn = screen.getByRole('list', { name: 'Built in' })
    expect(await within(builtIn).findByText('2 tools')).toBeInTheDocument()
    expect(within(builtIn).getByText('vide-docs')).toBeInTheDocument()
    expect(within(builtIn).queryByText('vide-search')).toBeNull()
    expect(within(builtIn).getByText('Always on')).toBeInTheDocument()
    expect(within(builtIn).getByRole('switch', { name: 'Enable vide-todos' })).toBeChecked()
  })

  it('shows one empty line when no installed app adds tools', () => {
    useAppContribStore.setState({ apps: [app({ agentTools: [] }), app({ id: 'x', agentTools: undefined })] })
    render(<AgentToolingSettingsPage />)
    expect(screen.getByText('No installed Store app adds agent tools yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'From apps' })).toBeNull()
  })

  it('lists apps with tools, expands their tool list, and switches the app', () => {
    useAppContribStore.setState({ apps: [app()] })
    render(<AgentToolingSettingsPage />)
    const list = screen.getByRole('list', { name: 'From apps' })
    expect(within(list).getByText('Store app · v0.1.0')).toBeInTheDocument()
    expect(within(list).getByText('1 tool')).toBeInTheDocument()
    expect(within(list).queryByLabelText('DuckDuckGo tools')).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: /DuckDuckGo/ }))
    expect(within(list).getByLabelText('DuckDuckGo tools')).toHaveTextContent('Search the web.')
    fireEvent.click(within(list).getByRole('switch', { name: 'Enable DuckDuckGo' }))
    expect(api.appsSetEnabled).toHaveBeenCalledWith('duckduckgo', false)
  })

  it('shows a disabled app with its switch off, and opens its Store page', () => {
    useAppContribStore.setState({ apps: [app({ status: 'disabled' })] })
    render(<AgentToolingSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Enable DuckDuckGo' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Store page' }))
    expect(openTab).toHaveBeenCalledWith({ path: 'store://app/duckduckgo', content: '', dirty: false })
  })

  it('"Get more tools in the Store" opens the Store on the Agent tools category', () => {
    render(<AgentToolingSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Get more tools in the Store' }))
    expect(useStoreStore.getState().presetCategory).toBe('agent-tools')
    expect(openTab).toHaveBeenCalledWith({ path: 'store://Store', content: '', dirty: false })
  })
})
