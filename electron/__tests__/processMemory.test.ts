import { describe, it, expect } from 'vitest'
import { childrenByParent, parseProcessTable, treeRssBytes } from '../processMemory'

const PS = `
    1     0   1000
  100     1   2000
  101   100    500
  102   101  40000
  103   102   4000
  104   102   4000
  200     1   9000
garbage line
`

describe('processMemory', () => {
  it('parses pid, parent and rss (KB to bytes), skipping junk', () => {
    const table = parseProcessTable(PS)
    expect(table.size).toBe(7)
    expect(table.get(102)).toEqual({ ppid: 101, rssBytes: 40000 * 1024 })
  })

  it('sums a process and all of its descendants, and nothing else', () => {
    const table = parseProcessTable(PS)
    const children = childrenByParent(table)
    // shell 101 -> claude 102 -> two MCP servers
    expect(treeRssBytes(101, table, children)).toBe((500 + 40000 + 4000 + 4000) * 1024)
    expect(treeRssBytes(200, table, children)).toBe(9000 * 1024)
  })

  it('counts a process that has already exited as zero', () => {
    const table = parseProcessTable(PS)
    expect(treeRssBytes(999, table, childrenByParent(table))).toBe(0)
  })
})
