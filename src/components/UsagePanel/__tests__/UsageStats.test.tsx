import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Gauge, ResetInfo, BurnRateStat, CutoffStat } from '@/components/UsagePanel/UsageStats'

describe('Gauge', () => {
  it('sizes the svg in rem so it scales with the global font-size setting instead of a fixed pixel size', () => {
    const { container } = render(<Gauge pct={50} label="SESSION" />)
    const svg = container.querySelector('svg')!

    // A hardcoded width/height attribute (px) never responds to the root
    // font-size scaling applied by fontSizeStore.ts — only rem-based sizing does.
    expect(svg.getAttribute('width')).toBeNull()
    expect(svg.getAttribute('height')).toBeNull()
    expect(svg.getAttribute('class') ?? '').toMatch(/rem/)
  })
})

describe('usage panel stat text wrapping', () => {
  it('keeps ResetInfo text on one line so a narrow panel scrolls instead of squeezing lines apart', () => {
    const { container } = render(<ResetInfo label="Session resets" resetAt={Date.now() + 3_600_000} now={Date.now()} />)
    expect(container.firstElementChild?.className ?? '').toMatch(/whitespace-nowrap/)
  })

  it('keeps BurnRateStat text on one line', () => {
    const { container } = render(<BurnRateStat label="session" ratePerHour={20.5} />)
    expect(container.firstElementChild?.className ?? '').toMatch(/whitespace-nowrap/)
  })

  it('keeps CutoffStat text on one line', () => {
    const { container } = render(<CutoffStat label="session" cutoffAt={Date.now() + 3_600_000} now={Date.now()} />)
    expect(container.firstElementChild?.className ?? '').toMatch(/whitespace-nowrap/)
  })
})
