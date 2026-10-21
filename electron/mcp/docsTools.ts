import { readFile } from 'fs/promises'
import type { McpToolDef } from './protocol'

// Large documents (specs, design docs, READMEs) are where small local models
// burn the most context: reading a 1,000-line spec whole just to find one
// section, then again later when it has scrolled out of attention. These two
// tools let any agent read the table of contents first and then pull only
// the section it needs.

export const DOCS_INSTRUCTIONS =
  'For large Markdown documents (specs, design docs, READMEs), call doc_outline(path) first to get the ' +
  'section list with line ranges, then read_doc_section(path, heading) for just the part you need, ' +
  'instead of reading the whole file.'

export interface DocHeading {
  level: number
  title: string
  // 1-indexed, inclusive. `end` runs to just before the next heading of the
  // same or a higher level, i.e. it includes subsections.
  start: number
  end: number
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^\s*(```|~~~)/

export function parseHeadings(text: string): { headings: DocHeading[]; totalLines: number } {
  const lines = text.split('\n')
  const headings: DocHeading[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (FENCE_RE.test(line)) inFence = !inFence
    if (inFence) return
    const m = HEADING_RE.exec(line)
    if (m) headings.push({ level: m[1].length, title: m[2], start: i + 1, end: lines.length })
  })
  for (let i = 0; i < headings.length; i++) {
    const next = headings.slice(i + 1).find((h) => h.level <= headings[i].level)
    if (next) headings[i].end = next.start - 1
  }
  return { headings, totalLines: lines.length }
}

export function formatOutline(path: string, headings: DocHeading[], totalLines: number): string {
  if (headings.length === 0) {
    return `${path}: ${totalLines} lines, no Markdown headings found. Read it with read_file line ranges instead.`
  }
  const rows = headings.map((h) => `${'  '.repeat(h.level - 1)}L${h.start}-${h.end}  ${'#'.repeat(h.level)} ${h.title}`)
  return `${path}: ${totalLines} lines, ${headings.length} sections\n${rows.join('\n')}`
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim()
}

// Exact title first, then a leading match ("13" or "13. Dashboard" finds
// "13. Dashboard and user experience"), then a substring match.
export function findSection(headings: DocHeading[], query: string): DocHeading[] {
  const q = normalize(query)
  const exact = headings.filter((h) => normalize(h.title) === q)
  if (exact.length) return exact
  // A bare section number matches the title's own number exactly, so "1"
  // finds "1. Instructions" but not "13. ..." or "1.5 ...".
  if (/^\d+(\.\d+)*\.?$/.test(q)) {
    const num = q.replace(/\.$/, '')
    return headings.filter((h) => /^(\d+(?:\.\d+)*)/.exec(normalize(h.title))?.[1] === num)
  }
  const prefixed = headings.filter((h) => {
    const t = normalize(h.title)
    return t.startsWith(q) && (t.length === q.length || /[\s.:)\-—]/.test(t[q.length]) || /[\s.:)\-—]$/.test(q))
  })
  if (prefixed.length) return prefixed
  return headings.filter((h) => normalize(h.title).includes(q))
}

export function buildDocsTools(): McpToolDef[] {
  return [
    {
      name: 'doc_outline',
      description:
        'List the sections of a Markdown document at an absolute path, with the line range of each ' +
        '(subsections included in their parent range). Use this before reading a large doc.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Absolute path to the document' } },
        required: ['path'],
      },
      handler: async (args) => {
        const path = String(args.path)
        const { headings, totalLines } = parseHeadings(await readFile(path, 'utf-8'))
        return formatOutline(path, headings, totalLines)
      },
    },
    {
      name: 'read_doc_section',
      description:
        'Read one section of a Markdown document by its heading (exact title, its number like "13", or a ' +
        'unique part of it), including its subsections.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the document' },
          heading: { type: 'string', description: 'Heading text, number, or a unique part of it' },
        },
        required: ['path', 'heading'],
      },
      handler: async (args) => {
        const path = String(args.path)
        const text = await readFile(path, 'utf-8')
        const { headings, totalLines } = parseHeadings(text)
        const matches = findSection(headings, String(args.heading))
        if (matches.length === 0) {
          return `No section matching "${args.heading}".\n${formatOutline(path, headings, totalLines)}`
        }
        if (matches.length > 1) {
          const list = matches.map((h) => `L${h.start}-${h.end}  ${'#'.repeat(h.level)} ${h.title}`).join('\n')
          return `"${args.heading}" matches ${matches.length} sections — use a more specific heading:\n${list}`
        }
        const h = matches[0]
        const body = text.split('\n').slice(h.start - 1, h.end).join('\n')
        return `[${path} lines ${h.start}-${h.end} of ${totalLines}]\n${body}`
      },
    },
  ]
}
