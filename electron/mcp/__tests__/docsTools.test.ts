import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildDocsTools, parseHeadings, findSection } from '../docsTools'

const SPEC = [
  '# Service Recall Platform',            // 1
  '',                                      // 2
  '## 1. Instructions',                    // 3
  'Build the platform.',                   // 4
  '## 13. Dashboard and user experience',  // 5
  'Professional, simple.',                 // 6
  '### Screens',                           // 7
  '```md',                                 // 8
  '# not a heading inside a fence',        // 9
  '```',                                   // 10
  '## 14. CSV import and export',          // 11
  'Customer CSV only.',                    // 12
  '## 1.5 Notes',                          // 13
].join('\n')

describe('parseHeadings', () => {
  it('finds headings with subsection-inclusive ranges and skips fenced code', () => {
    const { headings, totalLines } = parseHeadings(SPEC)
    expect(totalLines).toBe(13)
    expect(headings.map((h) => [h.title, h.start, h.end])).toEqual([
      ['Service Recall Platform', 1, 13],
      ['1. Instructions', 3, 4],
      ['13. Dashboard and user experience', 5, 10],
      ['Screens', 7, 10],
      ['14. CSV import and export', 11, 12],
      ['1.5 Notes', 13, 13],
    ])
  })
})

describe('findSection', () => {
  const { headings } = parseHeadings(SPEC)

  it('matches by section number without confusing 1 with 13 or 1.5', () => {
    expect(findSection(headings, '13').map((h) => h.start)).toEqual([5])
    expect(findSection(headings, '1').map((h) => h.start)).toEqual([3])
  })

  it('matches exact titles, Markdown-prefixed titles, and unique substrings', () => {
    expect(findSection(headings, '## 14. CSV import and export')[0].start).toBe(11)
    expect(findSection(headings, 'dashboard')[0].start).toBe(5)
  })
})

describe('docs tools', () => {
  let dir: string
  let path: string
  const tool = (name: string) => buildDocsTools().find((t) => t.name === name)!

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docs-'))
    path = join(dir, 'spec.md')
    await writeFile(path, SPEC)
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('doc_outline lists sections with line ranges', async () => {
    const out = (await tool('doc_outline').handler({ path })) as string
    expect(out).toContain('13 lines, 6 sections')
    expect(out).toContain('L5-10  ## 13. Dashboard and user experience')
  })

  it('read_doc_section returns only that section, with its position', async () => {
    const out = (await tool('read_doc_section').handler({ path, heading: '14' })) as string
    expect(out).toBe(`[${path} lines 11-12 of 13]\n## 14. CSV import and export\nCustomer CSV only.`)
  })

  it('read_doc_section lists the outline when nothing matches', async () => {
    const out = (await tool('read_doc_section').handler({ path, heading: 'billing' })) as string
    expect(out).toContain('No section matching "billing"')
    expect(out).toContain('L11-12')
  })
})
