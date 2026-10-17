import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parsePmsetBatt, parseLinuxBattery, readLinuxBattery } from '../systemBattery'

describe('parsePmsetBatt', () => {
  it('reads a laptop on battery', () => {
    const out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=4653155)\t72%; discharging; 3:12 remaining present: true\n"
    expect(parsePmsetBatt(out)).toEqual({ percent: 72, charging: false, pluggedIn: false, minutesLeft: 192 })
  })

  it('reads a laptop charging, with no time left shown', () => {
    const out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t48%; charging; 1:05 remaining present: true\n"
    expect(parsePmsetBatt(out)).toEqual({ percent: 48, charging: true, pluggedIn: true, minutesLeft: null })
  })

  it('reads a full laptop on AC', () => {
    const out = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t100%; charged; 0:00 remaining present: true\n"
    expect(parsePmsetBatt(out)).toEqual({ percent: 100, charging: false, pluggedIn: true, minutesLeft: null })
  })

  it('has no time left while macOS is still estimating', () => {
    const out = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t90%; discharging; (no estimate) present: true\n"
    expect(parsePmsetBatt(out)?.minutesLeft).toBeNull()
  })

  it('returns null on a Mac without a battery (iMac, Mac mini)', () => {
    expect(parsePmsetBatt("Now drawing from 'AC Power'\n")).toBeNull()
  })
})

describe('parseLinuxBattery', () => {
  it('estimates time left from energy and power while discharging', () => {
    expect(parseLinuxBattery({ capacity: '72', status: 'Discharging', energy_now: '30000000', power_now: '10000000' })).toEqual({
      percent: 72, charging: false, pluggedIn: false, minutesLeft: 180,
    })
  })

  it('treats Full / Not charging as plugged in', () => {
    expect(parseLinuxBattery({ capacity: '100', status: 'Full' })).toEqual({ percent: 100, charging: false, pluggedIn: true, minutesLeft: null })
  })
})

describe('readLinuxBattery', () => {
  async function supplies(entries: Record<string, Record<string, string>>) {
    const root = await mkdtemp(join(tmpdir(), 'power-supply-'))
    for (const [name, files] of Object.entries(entries)) {
      await mkdir(join(root, name))
      for (const [file, value] of Object.entries(files)) await writeFile(join(root, name, file), value + '\n')
    }
    return root
  }

  it('finds the system battery, skipping mains and a wireless mouse', async () => {
    const root = await supplies({
      AC: { type: 'Mains', online: '0' },
      hidpp_battery_0: { type: 'Battery', scope: 'Device', capacity: '40', status: 'Discharging' },
      BAT0: { type: 'Battery', scope: 'System', capacity: '55', status: 'Charging' },
    })
    try {
      expect(await readLinuxBattery(root)).toEqual({ percent: 55, charging: true, pluggedIn: true, minutesLeft: null })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns null on a desktop with no battery', async () => {
    const root = await supplies({ AC: { type: 'Mains', online: '1' } })
    try {
      expect(await readLinuxBattery(root)).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    expect(await readLinuxBattery(join(root, 'missing'))).toBeNull()
  })
})
