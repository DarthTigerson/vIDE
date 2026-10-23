import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { ipcMain } from 'electron'
import { mcpToolCatalog, registerMcpCatalogHandlers } from '../mcpCatalog'

describe('mcpToolCatalog', () => {
  it('lists every vIDE server with the tools its definitions expose', () => {
    const catalog = mcpToolCatalog()
    expect(Object.keys(catalog).sort()).toEqual(['browser', 'docs', 'notes', 'scripts', 'search', 'todos'])
    expect(catalog.todos.map((t) => t.name)).toContain('start_todo')
    expect(catalog.docs.map((t) => t.name)).toEqual(['doc_outline', 'read_doc_section'])
    expect(catalog.search.map((t) => t.name)).toEqual(['web_search'])
    for (const tools of Object.values(catalog)) {
      for (const tool of tools) {
        expect(Object.keys(tool).sort()).toEqual(['description', 'name'])
        expect(tool.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('serves the catalog over mcp:catalog', async () => {
    registerMcpCatalogHandlers()
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'mcp:catalog')![1]
    expect(await handler({} as never)).toEqual(mcpToolCatalog())
  })
})
