import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface BatteryStatus {
  percent: number
  charging: boolean
  // On mains power (charging, full, or holding charge).
  pluggedIn: boolean
  // Estimated time to empty while on battery; null when unknown or plugged in.
  minutesLeft: number | null
}

// `pmset -g batt`: a laptop has a line like
//   " -InternalBattery-0 (id=4653155)	72%; discharging; 3:12 remaining present: true"
// under "Now drawing from 'Battery Power'" (or 'AC Power'). A Mac with no
// battery (iMac, Mac mini, Studio) prints only the "Now drawing" line → null.
export function parsePmsetBatt(output: string): BatteryStatus | null {
  const line = output.split('\n').find((l) => /InternalBattery/.test(l))
  if (!line) return null
  const percentMatch = line.match(/(\d+)%/)
  if (!percentMatch) return null
  const state = (line.match(/%;\s*([^;]+);/)?.[1] ?? '').trim().toLowerCase()
  const pluggedIn = /'AC Power'/.test(output) || state !== 'discharging'
  const time = line.match(/(\d+):(\d{2}) remaining/)
  const minutes = time ? Number(time[1]) * 60 + Number(time[2]) : null
  return {
    percent: Number(percentMatch[1]),
    charging: state === 'charging',
    pluggedIn,
    // "0:00 remaining" shows while macOS is still estimating.
    minutesLeft: !pluggedIn && minutes ? minutes : null,
  }
}

// One /sys/class/power_supply/<name>/ folder's files, read into a map.
export function parseLinuxBattery(files: Record<string, string>): BatteryStatus | null {
  const percent = Number(files.capacity)
  if (!Number.isFinite(percent)) return null
  const status = (files.status ?? '').trim()
  const pluggedIn = status !== 'Discharging'
  const num = (key: string) => Number(files[key])
  let minutesLeft: number | null = null
  if (!pluggedIn) {
    if (num('power_now') > 0 && num('energy_now') > 0) minutesLeft = Math.round((num('energy_now') / num('power_now')) * 60)
    else if (num('current_now') > 0 && num('charge_now') > 0) minutesLeft = Math.round((num('charge_now') / num('current_now')) * 60)
  }
  return { percent, charging: status === 'Charging', pluggedIn, minutesLeft }
}

const LINUX_BATTERY_FILES = ['type', 'scope', 'capacity', 'status', 'energy_now', 'power_now', 'charge_now', 'current_now']

// The first system battery under `root`. Wireless mice and keyboards also
// appear as type "Battery", but with scope "Device"; desktops have none.
export async function readLinuxBattery(root = '/sys/class/power_supply'): Promise<BatteryStatus | null> {
  let names: string[]
  try {
    names = (await readdir(root)).sort()
  } catch {
    return null
  }
  for (const name of names) {
    const files: Record<string, string> = {}
    await Promise.all(
      LINUX_BATTERY_FILES.map(async (file) => {
        try {
          files[file] = (await readFile(join(root, name, file), 'utf-8')).trim()
        } catch {
          // not every supply has every file
        }
      })
    )
    if (files.type !== 'Battery' || files.scope === 'Device') continue
    const status = parseLinuxBattery(files)
    if (status) return status
  }
  return null
}

// null on a machine without a battery, so the title bar shows nothing there.
export async function getBatteryStatus(): Promise<BatteryStatus | null> {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('pmset', ['-g', 'batt'])
      return parsePmsetBatt(stdout)
    } catch {
      return null
    }
  }
  return readLinuxBattery()
}
