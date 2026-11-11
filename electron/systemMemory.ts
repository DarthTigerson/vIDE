import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type MemoryPressure = 'normal' | 'warn' | 'critical'

export interface SystemMemoryUsage {
  usedBytes: number
  totalBytes: number
  // RAM spilled to disk (macOS swap, Linux swap). The clearest sign the
  // machine is out of RAM — any swap in use flips pressure to critical.
  swapUsedBytes: number
  // RAM reclaimed by compressing pages in place (macOS compressor; ~0 on
  // Linux without zram). Rising compression is an early pressure signal.
  compressedBytes: number
  pressure: MemoryPressure
}

// Pressure leans on swap and compression — the honest distress signals — and
// only uses a very high used fraction as a backstop, so a machine merely
// holding lots of reclaimable file cache isn't flagged.
export function derivePressure(u: {
  usedBytes: number
  totalBytes: number
  compressedBytes: number
  swapUsedBytes: number
}): MemoryPressure {
  const usedFraction = u.totalBytes > 0 ? u.usedBytes / u.totalBytes : 0
  const compRatio = u.totalBytes > 0 ? u.compressedBytes / u.totalBytes : 0
  if (u.swapUsedBytes > 0 || compRatio >= 0.2 || usedFraction >= 0.95) return 'critical'
  if (compRatio >= 0.08 || usedFraction >= 0.85) return 'warn'
  return 'normal'
}

// Parses `sysctl vm.swapusage` ("total = 2048.00M  used = 512.00M  free = …").
export function parseSwapUsage(stdout: string): number {
  const m = stdout.match(/used\s*=\s*([\d.]+)([KMGT]?)/i)
  if (!m) return 0
  const unit = m[2].toUpperCase()
  const mult = unit === 'G' ? 1024 ** 3 : unit === 'T' ? 1024 ** 4 : unit === 'K' ? 1024 : 1024 ** 2
  return Math.round(Number(m[1]) * mult)
}

function parseVmStatPages(vmStat: string): Record<string, number> {
  const pages: Record<string, number> = {}
  for (const line of vmStat.split('\n')) {
    const match = line.match(/^Pages (\w[\w -]*?):\s+(\d+)\.?$/)
    if (match) pages[match[1]] = Number(match[2])
  }
  return pages
}

// macOS reports free/inactive/purgeable pages that the OS can and will
// reclaim on demand (cached file content, etc.) - Activity Monitor excludes
// these from "Memory Used", so we do too. os.totalmem() supplies the total
// since it's reliable, unlike vm_stat's own page-size math on some machines.
// "Pages occupied by compressor" is memory the compressor actually holds.
export function parseVmStat(
  vmStat: string,
  totalBytes: number,
): { usedBytes: number; totalBytes: number; compressedBytes: number } {
  const pageSizeMatch = vmStat.match(/page size of (\d+) bytes/)
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16384
  const pages = parseVmStatPages(vmStat)
  const reclaimablePages = (pages.free ?? 0) + (pages.inactive ?? 0) + (pages.purgeable ?? 0)
  return {
    usedBytes: totalBytes - reclaimablePages * pageSize,
    totalBytes,
    compressedBytes: (pages['occupied by compressor'] ?? 0) * pageSize,
  }
}

export function parseMeminfo(meminfo: string): SystemMemoryUsage {
  const num = (re: RegExp) => {
    const m = meminfo.match(re)
    return m ? Number(m[1]) : 0
  }
  const totalBytes = num(/^MemTotal:\s+(\d+) kB$/m) * 1024
  const usedBytes = totalBytes - num(/^MemAvailable:\s+(\d+) kB$/m) * 1024
  const swapUsedBytes = (num(/^SwapTotal:\s+(\d+) kB$/m) - num(/^SwapFree:\s+(\d+) kB$/m)) * 1024
  const compressedBytes = 0
  return {
    usedBytes,
    totalBytes,
    swapUsedBytes,
    compressedBytes,
    pressure: derivePressure({ usedBytes, totalBytes, compressedBytes, swapUsedBytes }),
  }
}

export async function getSystemMemoryUsage(): Promise<SystemMemoryUsage> {
  if (process.platform === 'darwin') {
    const { stdout } = await execFileAsync('vm_stat')
    const base = parseVmStat(stdout, os.totalmem())
    let swapUsedBytes = 0
    try {
      const { stdout: swap } = await execFileAsync('sysctl', ['vm.swapusage'])
      swapUsedBytes = parseSwapUsage(swap)
    } catch { /* sysctl unavailable — treat as no swap */ }
    return { ...base, swapUsedBytes, pressure: derivePressure({ ...base, swapUsedBytes }) }
  }
  const meminfo = await readFile('/proc/meminfo', 'utf-8')
  return parseMeminfo(meminfo)
}
