import { create } from 'zustand'
import type { McpServerId, McpToolInfo } from '../../electron/mcp/mcpTypes'

interface McpCatalogStore {
  tools: Record<McpServerId, McpToolInfo[]> | null
  load: () => Promise<void>
}

// The tool lists never change while the app runs, so they're fetched once.
export const useMcpCatalogStore = create<McpCatalogStore>((set, get) => ({
  tools: null,
  load: async () => {
    if (get().tools) return
    set({ tools: await window.api.mcpCatalog() })
  },
}))
