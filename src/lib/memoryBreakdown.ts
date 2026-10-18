import type { MemoryBreakdown } from '@/types/api'

export interface MemoryRow {
  key: string
  label: string
  bytes: number
  // The row's dot: a session's agent-bar colour, or a fixed colour kept clear
  // of the session palette (lib/claudeInstanceHues.ts) for the other rows.
  hue: string
}

const VIDE_HUE = '#A8B95C'
const TERMINALS_HUE = '#7F8CA8'
const LANGUAGE_SERVERS_HUE = '#A08670'
const UNKNOWN_SESSION_HUE = '#D97757'

// The rows under "vIDE total" in the RAM hover panel: vIDE itself, then one
// "Claude" row per session ("Claude 2", … when there are several), told apart
// by their agent-bar colour. `ownHues` (this window's sessions) wins over the
// colour main remembered from session files, which can lag a session that was
// never saved. Terminal and language server rows only show while one is running.
export function memoryRows(breakdown: MemoryBreakdown, ownHues: Record<string, string>): { totalBytes: number; rows: MemoryRow[] } {
  const rows: MemoryRow[] = [
    { key: 'app', label: 'vIDE', bytes: breakdown.appBytes, hue: VIDE_HUE },
    ...breakdown.sessions.map((s, i) => ({
      key: s.instanceId,
      label: i === 0 ? 'Claude' : `Claude ${i + 1}`,
      bytes: s.bytes,
      hue: ownHues[s.instanceId] ?? s.hue ?? UNKNOWN_SESSION_HUE,
    })),
  ]
  if (breakdown.terminalsBytes > 0) {
    rows.push({ key: 'terminals', label: 'Terminals', bytes: breakdown.terminalsBytes, hue: TERMINALS_HUE })
  }
  if (breakdown.languageServersBytes > 0) {
    rows.push({ key: 'lsp', label: 'Language servers', bytes: breakdown.languageServersBytes, hue: LANGUAGE_SERVERS_HUE })
  }
  return { totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0), rows }
}

// "1.9 GB" from 1 GB up, whole megabytes below that ("650 MB").
export function formatMemory(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
