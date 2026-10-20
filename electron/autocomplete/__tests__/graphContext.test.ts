import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GraphContext } from '../graphContext'

let root: string

function node(label: string, file: string, line: number) {
  return { id: `${file}:${label}`, label, source_file: file, source_location: `L${line}`, file_type: 'code' }
}

function writeGraph(nodes: object[]) {
  mkdirSync(join(root, 'graphify-out'), { recursive: true })
  writeFileSync(join(root, 'graphify-out', 'graph.json'), JSON.stringify({ nodes, links: [] }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vide-graphctx-'))
  mkdirSync(join(root, 'src', 'stores'), { recursive: true })
  writeFileSync(join(root, 'src', 'stores', 'editorStore.ts'), [
    "import { create } from 'zustand'",
    '',
    'export interface EditorState {',
    '  tabs: Tab[]',
    '  openTab: (tab: Tab) => void',
    '}',
    '',
    'export const useEditorStore = create<EditorState>((set) => ({',
    '  tabs: [],',
    '  openTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab] })),',
    '}))',
    '',
    'export function closeTab(path: string, force = false): void {',
    '  doClose(path)',
    '}',
  ].join('\n'))
  writeFileSync(join(root, 'src', 'Panel.tsx'), "import { closeTab, useEditorStore } from './stores/editorStore'\nimport type { Big } from './big'\nimport { doClose } from './close'\nexport function Panel() {}\n")
  writeGraph([
    node('editorStore.ts', 'src/stores/editorStore.ts', 1),
    node('EditorState', 'src/stores/editorStore.ts', 3),
    node('useEditorStore', 'src/stores/editorStore.ts', 8),
    node('closeTab()', 'src/stores/editorStore.ts', 13),
    node('Panel()', 'src/Panel.tsx', 1),
  ])
})

const panel = () => join(root, 'src', 'Panel.tsx')

describe('GraphContext', () => {
  it('sends the signature of a function used near the cursor, not its body', async () => {
    const chunks = await new GraphContext().chunksFor(panel(), 'function Panel() {\n  closeTab(', ')\n}')
    expect(chunks).toEqual([{ filename: 'src/stores/editorStore.ts', text: 'export function closeTab(path: string, force = false): void {' }])
  })

  it('follows a value to the type in its first line, and sends whole types', async () => {
    const chunks = await new GraphContext().chunksFor(panel(), 'const t = useEditorStore.getState().', '')
    expect(chunks.map((c) => c.text)).toEqual([
      'export const useEditorStore = create<EditorState>((set) => ({',
      'export interface EditorState {\n  tabs: Tab[]\n  openTab: (tab: Tab) => void\n}',
    ])
  })

  it("only looks up names the file imports: a name it doesn't import is noise", async () => {
    writeFileSync(join(root, 'src', 'other.ts'), 'export function setThing(x: number) {\n}\n')
    writeGraph([node('setThing()', 'src/other.ts', 1), node('closeTab()', 'src/stores/editorStore.ts', 13)])
    const chunks = await new GraphContext().chunksFor(panel(), 'setThing(1)\ncloseTab(', '')
    expect(chunks.map((c) => c.filename)).toEqual(['src/stores/editorStore.ts'])
  })

  it("leaves out the current file's own definitions", async () => {
    expect(await new GraphContext().chunksFor(panel(), 'Panel(', '')).toEqual([])
  })

  it('returns nothing for a project without a graph', async () => {
    const other = mkdtempSync(join(tmpdir(), 'vide-nograph-'))
    writeFileSync(join(other, 'a.ts'), '')
    expect(await new GraphContext().chunksFor(join(other, 'a.ts'), 'closeTab(', '')).toEqual([])
  })

  it('picks up a rebuilt graph', async () => {
    const ctx = new GraphContext()
    expect(await ctx.chunksFor(panel(), 'doClose(', '')).toEqual([])
    writeFileSync(join(root, 'src', 'close.ts'), 'export function doClose(path: string) {\n}\n')
    writeGraph([node('doClose()', 'src/close.ts', 1)])
    const later = new Date(Date.now() + 5000)
    utimesSync(join(root, 'graphify-out', 'graph.json'), later, later)
    expect(await ctx.chunksFor(panel(), 'doClose(', '')).toEqual([{ filename: 'src/close.ts', text: 'export function doClose(path: string) {' }])
  })

  it('stays within its budget', async () => {
    const lines = ['export interface Big {', ...Array.from({ length: 200 }, (_, i) => `  field${i}: string`), '}']
    writeFileSync(join(root, 'src', 'big.ts'), lines.join('\n'))
    writeGraph([node('Big', 'src/big.ts', 1)])
    const chunks = await new GraphContext().chunksFor(panel(), 'const b: Big = ', '')
    expect(chunks[0].text.length).toBeLessThanOrEqual(1500)
  })
})
