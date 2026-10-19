import { describe, it, expect, vi, beforeEach } from 'vitest'

const { webSearchMock } = vi.hoisted(() => ({ webSearchMock: vi.fn() }))

// Mock only the network-touching webSearch; keep the real formatSearchResults
// so the test exercises the actual output the model will see.
vi.mock('../../webSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../webSearch')>()
  return { ...actual, webSearch: webSearchMock }
})

import { buildSearchTools } from '../searchTools'

describe('searchTools', () => {
  beforeEach(() => webSearchMock.mockReset())

  it('exposes a single web_search tool with query required', () => {
    const tools = buildSearchTools()
    expect(tools.map((t) => t.name)).toEqual(['web_search'])
    expect((tools[0].inputSchema as { required: string[] }).required).toEqual(['query'])
  })

  it('passes query and maxResults through to webSearch and formats the results', async () => {
    webSearchMock.mockResolvedValue([
      { title: 'Vite', url: 'https://vite.dev', snippet: 'Next gen tooling' },
    ])

    const tool = buildSearchTools()[0]
    const result = await tool.handler({ query: 'vite docs', maxResults: 3 })

    expect(webSearchMock).toHaveBeenCalledWith('vite docs', 3)
    expect(result).toContain('Web results for "vite docs"')
    expect(result).toContain('1. Vite')
    expect(result).toContain('https://vite.dev')
  })

  it('reports no results distinctly', async () => {
    webSearchMock.mockResolvedValue([])
    const result = await buildSearchTools()[0].handler({ query: 'zxqw' })
    expect(result).toBe('No web results found for "zxqw".')
  })
})
