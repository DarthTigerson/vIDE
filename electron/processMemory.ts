import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ProcessEntry { ppid: number; rssBytes: number }
export type ProcessTable = Map<number, ProcessEntry>

// `ps -axo pid=,ppid=,rss=`: one "pid ppid rss" line per process, rss in KB
// on both macOS and Linux.
export function parseProcessTable(stdout: string): ProcessTable {
  const table: ProcessTable = new Map()
  for (const line of stdout.split('\n')) {
    const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number)
    if (Number.isInteger(pid) && Number.isInteger(ppid) && Number.isFinite(rss)) {
      table.set(pid, { ppid, rssBytes: rss * 1024 })
    }
  }
  return table
}

export function childrenByParent(table: ProcessTable): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const [pid, { ppid }] of table) {
    const list = children.get(ppid)
    if (list) list.push(pid)
    else children.set(ppid, [pid])
  }
  return children
}

// A process plus everything it started: a Claude PTY is a login shell whose
// child is the CLI, whose children are its MCP servers.
export function treeRssBytes(rootPid: number, table: ProcessTable, children: Map<number, number[]>): number {
  let total = 0
  const stack = [rootPid]
  const seen = new Set<number>()
  while (stack.length > 0) {
    const pid = stack.pop()!
    if (seen.has(pid)) continue
    seen.add(pid)
    total += table.get(pid)?.rssBytes ?? 0
    stack.push(...(children.get(pid) ?? []))
  }
  return total
}

export async function readProcessTable(): Promise<ProcessTable> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss='])
  return parseProcessTable(stdout)
}
