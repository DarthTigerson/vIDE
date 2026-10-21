import type { BridgeToolCallBlock } from '@/stores/bridgeStore'

export type ToolIcon = 'read' | 'edit' | 'search' | 'run' | 'list' | 'delete' | 'move' | 'tool'

export interface ToolView {
  icon: ToolIcon
  // Past tense once finished, present while running ("Read" / "Reading").
  verb: string
  activeVerb: string
  // Finishes "Wants to …" while the call waits for approval.
  ask: string
  target?: string
  // A read's line range, shown dimmed after the target.
  range?: string
}

export function relPath(path: string, cwd: string): string {
  if (cwd && path.startsWith(cwd.endsWith('/') ? cwd : `${cwd}/`)) return path.slice(cwd.replace(/\/$/, '').length + 1)
  return path
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

export function describeTool(block: BridgeToolCallBlock, cwd: string): ToolView {
  const a = block.args
  const path = str(a.path) ? relPath(a.path as string, cwd) : undefined
  switch (block.name) {
    case 'read_file': {
      const { startLine, endLine } = a as { startLine?: number; endLine?: number }
      const range = startLine !== undefined || endLine !== undefined ? `:${startLine ?? 1}–${endLine ?? ''}` : undefined
      return { icon: 'read', verb: 'Read', activeVerb: 'Reading', ask: 'read', target: path, range }
    }
    case 'edit_file':
      return { icon: 'edit', verb: 'Edited', activeVerb: 'Editing', ask: 'edit', target: path }
    case 'write_file':
      return { icon: 'edit', verb: 'Wrote', activeVerb: 'Writing', ask: 'write', target: path }
    case 'create_file':
      return { icon: 'edit', verb: 'Created', activeVerb: 'Creating', ask: 'create', target: path }
    case 'delete_file':
      return { icon: 'delete', verb: 'Deleted', activeVerb: 'Deleting', ask: 'delete', target: path }
    case 'move_file':
      return {
        icon: 'move',
        verb: 'Moved',
        activeVerb: 'Moving',
        ask: 'move',
        target: str(a.from) && str(a.to) ? `${relPath(a.from as string, cwd)} → ${relPath(a.to as string, cwd)}` : undefined,
      }
    case 'list_dir':
      return { icon: 'list', verb: 'Listed', activeVerb: 'Listing', ask: 'list', target: path ?? '.' }
    case 'grep_search':
      return { icon: 'search', verb: 'Searched', activeVerb: 'Searching', ask: 'search', target: str(a.query) }
    case 'glob_search':
      return { icon: 'search', verb: 'Found files', activeVerb: 'Finding files', ask: 'find files', target: str(a.pattern) }
    case 'run_command':
      return { icon: 'run', verb: 'Ran', activeVerb: 'Running', ask: 'run', target: str(a.command) }
    default:
      return { icon: 'tool', verb: block.name, activeVerb: block.name, ask: `use ${block.name}`, target: path }
  }
}

// Paths a finished tool changed, for the turn's "N files changed".
export function changedPaths(block: BridgeToolCallBlock): string[] {
  if (block.status !== 'done') return []
  const a = block.args
  switch (block.name) {
    case 'edit_file':
    case 'write_file':
    case 'create_file':
    case 'delete_file':
      return str(a.path) ? [a.path as string] : []
    case 'move_file':
      return [str(a.from), str(a.to)].filter((p): p is string => !!p)
    default:
      return []
  }
}

export interface DiffLine {
  kind: '+' | '-'
  text: string
}

// edit_file replaces old_string with new_string: drop the lines both share at
// the start and end so only the real change shows.
export function editDiff(oldString: string, newString: string): { lines: DiffLine[]; added: number; removed: number } {
  const a = oldString.split('\n')
  const b = newString.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const removed = a.slice(start, endA)
  const added = b.slice(start, endB)
  return {
    lines: [...removed.map((text) => ({ kind: '-' as const, text })), ...added.map((text) => ({ kind: '+' as const, text }))],
    added: added.length,
    removed: removed.length,
  }
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
