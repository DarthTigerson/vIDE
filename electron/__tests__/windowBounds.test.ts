import { describe, it, expect } from 'vitest'
import { fitBoundsToDisplays } from '../windowBounds'

const laptop = { x: 0, y: 25, width: 1512, height: 920 }
const external = { x: 1512, y: 0, width: 2560, height: 1415 }

describe('fitBoundsToDisplays', () => {
  it('keeps a position that is on a connected screen', () => {
    const saved = { x: 1800, y: 100, width: 1440, height: 900, maximized: false }
    expect(fitBoundsToDisplays(saved, [laptop, external])).toEqual({ x: 1800, y: 100, width: 1440, height: 900 })
  })

  it('drops the position when its screen is gone, shrinking to the primary screen', () => {
    const saved = { x: 1800, y: 100, width: 2000, height: 1200, maximized: false }
    expect(fitBoundsToDisplays(saved, [laptop])).toEqual({ width: 1512, height: 920 })
  })

  it('drops the position when only a sliver of the title bar would be reachable', () => {
    const saved = { x: 1450, y: 100, width: 1440, height: 900, maximized: false }
    expect(fitBoundsToDisplays(saved, [laptop])).toEqual({ width: 1440, height: 900 })
  })

  it('drops the position when the title bar sits above every screen', () => {
    const saved = { x: 100, y: -600, width: 1440, height: 900, maximized: false }
    expect(fitBoundsToDisplays(saved, [laptop])).toEqual({ width: 1440, height: 900 })
  })
})
