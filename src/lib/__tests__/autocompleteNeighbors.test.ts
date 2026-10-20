import { describe, it, expect } from 'vitest'
import { pickNeighborSnippets } from '../autocompleteNeighbors'

const filler = (n: number, word: string) => Array.from({ length: n }, (_, i) => `const ${word}${i} = ${i}`).join('\n')

describe('pickNeighborSnippets', () => {
  it('sends the part of another open file that shares the most names with the code at the cursor', () => {
    const store = [filler(40, 'unrelated'), 'export function openTab(tab: Tab) {', '  tabs.push(tab)', '  activePath = tab.path', '}', filler(40, 'other')].join('\n')
    const [chunk] = pickNeighborSnippets('const tab: Tab = makeTab()\nopenTab(tab', [{ filename: 'src/store.ts', text: store }])
    expect(chunk.filename).toBe('src/store.ts')
    expect(chunk.text).toContain('export function openTab(tab: Tab) {')
    expect(chunk.text.split('\n').length).toBeLessThanOrEqual(30)
  })

  it('leaves out files with nothing in common', () => {
    expect(pickNeighborSnippets('openTab(tab', [{ filename: 'x.ts', text: filler(50, 'zzz') }])).toEqual([])
  })

  it('keeps to a few snippets and a character budget', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ filename: `f${i}.ts`, text: `openTab(tab)\n${'x'.repeat(3000)}` }))
    const chunks = pickNeighborSnippets('openTab(tab', files)
    expect(chunks.length).toBeLessThanOrEqual(3)
    expect(chunks.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(4000)
  })
})
