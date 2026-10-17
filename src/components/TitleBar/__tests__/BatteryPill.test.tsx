/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { BatteryPill } from '../BatteryPill'

afterEach(cleanup)

function mockBattery(status: unknown) {
  ;(window as unknown as { api: unknown }).api = { getBatteryStatus: vi.fn(async () => status) }
}

describe('BatteryPill', () => {
  it('shows nothing on a machine without a battery (iMac)', async () => {
    mockBattery(null)
    const { container } = render(<BatteryPill withDivider />)
    await waitFor(() => expect(window.api.getBatteryStatus).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the percentage, and power and time left on hover', async () => {
    mockBattery({ percent: 72, charging: false, pluggedIn: false, minutesLeft: 192 })
    render(<BatteryPill />)
    const pill = await screen.findByTestId('battery-pill')
    expect(pill).toHaveTextContent('72%')
    expect(pill.className).toContain('text-fg-muted')

    fireEvent.mouseEnter(pill)
    expect(screen.getByText('On battery')).toBeInTheDocument()
    expect(screen.getByText('3 h 12 min')).toBeInTheDocument()
  })

  it('turns red when low and not charging', async () => {
    mockBattery({ percent: 15, charging: false, pluggedIn: false, minutesLeft: null })
    render(<BatteryPill />)
    expect((await screen.findByTestId('battery-pill')).className).toContain('text-red-400')
  })

  it('says Charging and hides time left while plugged in', async () => {
    mockBattery({ percent: 15, charging: true, pluggedIn: true, minutesLeft: null })
    render(<BatteryPill />)
    const pill = await screen.findByTestId('battery-pill')
    expect(pill.className).toContain('text-fg-muted')
    fireEvent.mouseEnter(pill)
    expect(screen.getByText('Charging')).toBeInTheDocument()
    expect(screen.queryByText('Time left')).toBeNull()
  })
})
