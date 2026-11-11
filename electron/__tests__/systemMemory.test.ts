import { describe, it, expect } from 'vitest'
import { parseVmStat, parseMeminfo, parseSwapUsage, derivePressure } from '../systemMemory'

describe('parseVmStat', () => {
  it('computes used bytes as total minus reclaimable pages, scaled by page size', () => {
    const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                             100000.
Pages active:                           200000.
Pages inactive:                         50000.
Pages speculative:                      1000.
Pages throttled:                        0.
Pages wired down:                       300000.
Pages purgeable:                        20000.
Pages copy-on-write:                    5000.
Pages zero filled:                      6000000.
Pages reactivated:                      1000.
Pages purged:                           2000.
File-backed pages:                      40000.
Anonymous pages:                        210000.
Pages stored in compressor:             10000.
Pages occupied by compressor:           8000.
Decompressions:                         500.
Compressions:                           700.
Pageins:                                90000.
Pageouts:                               100.
Swapins:                                0.
Swapouts:                               0.`
    const totalBytes = (100000 + 200000 + 50000 + 1000 + 300000 + 8000) * 16384

    const { usedBytes } = parseVmStat(vmStat, totalBytes)

    // used = total - (free + inactive + purgeable) * pageSize
    const reclaimable = (100000 + 50000 + 20000) * 16384
    expect(usedBytes).toBe(totalBytes - reclaimable)
  })

  it('reports compressor-occupied pages as compressedBytes', () => {
    const vmStat = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                             100000.
Pages inactive:                         50000.
Pages purgeable:                        20000.
Pages occupied by compressor:           8000.`
    const { compressedBytes } = parseVmStat(vmStat, 1024 ** 3)
    expect(compressedBytes).toBe(8000 * 16384)
  })
})

describe('parseSwapUsage', () => {
  it('parses megabytes of swap in use', () => {
    expect(parseSwapUsage('total = 2048.00M  used = 512.00M  free = 1536.00M  (encrypted)')).toBe(Math.round(512 * 1024 ** 2))
  })
  it('returns 0 when no swap is in use', () => {
    expect(parseSwapUsage('total = 0.00M  used = 0.00M  free = 0.00M')).toBe(0)
  })
  it('handles gigabyte units', () => {
    expect(parseSwapUsage('total = 4.00G  used = 2.00G  free = 2.00G')).toBe(Math.round(2 * 1024 ** 3))
  })
})

describe('derivePressure', () => {
  const total = 8 * 1024 ** 3
  it('is normal when used is low and nothing is swapped or compressed', () => {
    expect(derivePressure({ usedBytes: total * 0.4, totalBytes: total, compressedBytes: 0, swapUsedBytes: 0 })).toBe('normal')
  })
  it('is critical the moment any swap is in use', () => {
    expect(derivePressure({ usedBytes: total * 0.4, totalBytes: total, compressedBytes: 0, swapUsedBytes: 1 })).toBe('critical')
  })
  it('warns on heavy compression before swap starts', () => {
    expect(derivePressure({ usedBytes: total * 0.5, totalBytes: total, compressedBytes: total * 0.1, swapUsedBytes: 0 })).toBe('warn')
  })
  it('is critical at a very high used fraction', () => {
    expect(derivePressure({ usedBytes: total * 0.96, totalBytes: total, compressedBytes: 0, swapUsedBytes: 0 })).toBe('critical')
  })
})

describe('parseMeminfo', () => {
  it('computes used bytes as MemTotal minus MemAvailable, converted from kB', () => {
    const meminfo = `MemTotal:       16333384 kB
MemFree:          512000 kB
MemAvailable:    8000000 kB
Buffers:          200000 kB
Cached:          4000000 kB`

    const { usedBytes, totalBytes } = parseMeminfo(meminfo)

    expect(totalBytes).toBe(16333384 * 1024)
    expect(usedBytes).toBe((16333384 - 8000000) * 1024)
  })

  it('reports swap in use and flips pressure to critical', () => {
    const meminfo = `MemTotal:       16333384 kB
MemAvailable:    8000000 kB
SwapTotal:       2000000 kB
SwapFree:        1500000 kB`
    const { swapUsedBytes, pressure } = parseMeminfo(meminfo)
    expect(swapUsedBytes).toBe((2000000 - 1500000) * 1024)
    expect(pressure).toBe('critical')
  })
})
