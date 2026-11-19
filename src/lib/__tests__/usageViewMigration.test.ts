import { describe, it, expect } from 'vitest'
import { migrateUsageView } from '../usageViewMigration'

const KEY = 'vide:usagePanelView'
const mem = (v: string | null) => {
  let val = v
  return { getItem: () => val, setItem: (_k: string, x: string) => { val = x }, get: () => val }
}

describe('migrateUsageView', () => {
  it("rewrites the old built-in 'gauges' to the Bike Gauge app", () => {
    const s = mem('gauges'); migrateUsageView(s); expect(s.get()).toBe('app:bike-gauge')
  })
  it('leaves bars, app views and a missing key alone', () => {
    for (const v of ['bars', 'app:other', null]) { const s = mem(v); migrateUsageView(s); expect(s.get()).toBe(v) }
  })
  it('uses the panel key', () => {
    const seen: string[] = []
    migrateUsageView({ getItem: (k: string) => { seen.push(k); return null }, setItem: () => {} })
    expect(seen).toEqual([KEY])
  })
})
