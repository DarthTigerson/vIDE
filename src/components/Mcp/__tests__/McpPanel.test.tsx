import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const catalog = {
  todos: [{ name: 'start_todo', description: 'Start a ticket.' }, { name: 'get_todo', description: 'Read a ticket.' }],
  browser: [{ name: 'browser_click', description: 'Click.' }],
  notes: [{ name: 'read_note', description: 'Read a note.' }],
  scripts: [{ name: 'run_script', description: 'Run a script.' }],
  docs: [{ name: 'doc_outline', description: 'Outline.' }],
  search: [{ name: 'web_search', description: 'Search the web.' }],
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
  searchMcpEnable: vi.fn(async () => {}),
  searchMcpDisable: vi.fn(async () => {}),
}
;(window as unknown as { api: typeof api }).api = api

import { McpPanel } from '../McpPanel'
import { McpServerPage } from '../McpServerPage'
import { useEditorStore } from '@/stores/editorStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'
import { useSearchMcpStore } from '@/stores/searchMcpStore'
import { buildMcpServerPath } from '@/components/Settings/paths'

beforeEach(() => {
  useTodoMcpStore.setState({ enabled: true, pending: false, error: null })
  useSearchMcpStore.setState({ enabled: false, pending: false, error: null })
})

describe('McpPanel', () => {
  it("lists only vIDE's servers, enabled first and the rest under Disabled, with tool counts", async () => {
    render(<McpPanel />)
    const enabled = screen.getByRole('region', { name: 'Enabled' })
    const disabled = screen.getByRole('region', { name: 'Disabled' })
    expect(enabled.textContent).toContain('vide-todos')
    expect(enabled.textContent).toContain('vide-docs')
    expect(disabled.textContent).toContain('vide-search')
    expect(enabled.textContent).not.toContain('vide-search')
    await waitFor(() => expect(screen.getByText('vide-todos').closest('button')!.textContent).toContain('2 tools'))
    expect(screen.getByText('vide-search').closest('button')!.textContent).toContain('1 tool')
  })

  it("opens a server's page in a tab when its row is clicked", () => {
    const openTab = vi.spyOn(useEditorStore.getState(), 'openTab')
    render(<McpPanel />)
    fireEvent.click(screen.getByText('vide-todos'))
    expect(openTab).toHaveBeenCalledWith({ path: buildMcpServerPath('todos'), content: '', dirty: false })
  })

  it('shows a Store button at the bottom', () => {
    render(<McpPanel />)
    expect(screen.getByRole('button', { name: 'Store' })).toBeTruthy()
  })
})

describe('McpServerPage', () => {
  it('lists the server tools and turns it off through its existing store', async () => {
    render(<McpServerPage serverId="todos" />)
    await waitFor(() => expect(screen.getByText('start_todo')).toBeTruthy())
    expect(screen.getByText('Read a ticket.')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Enable vide-todos' }))
    await waitFor(() => expect(api.todosMcpDisable).toHaveBeenCalled())
    expect(useTodoMcpStore.getState().enabled).toBe(false)
  })

  it('has no switch for vide-docs, which is always on', () => {
    render(<McpServerPage serverId="docs" />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('Always on')).toBeTruthy()
  })
})
