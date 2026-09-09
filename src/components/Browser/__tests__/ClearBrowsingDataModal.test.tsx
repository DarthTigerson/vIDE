/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { ClearBrowsingDataModal } from '../ClearBrowsingDataModal'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'

beforeEach(() => {
  localStorage.clear()
  useBrowserRecentStore.setState({ entries: [] })
  useBrowserClosedTabsStore.setState({ entries: [] })
  ;(global as any).window.api = {
    browserViewClearCache: vi.fn().mockResolvedValue(undefined),
    browserViewClearCookies: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  cleanup()
})

describe('ClearBrowsingDataModal', () => {
  it('renders all three checkboxes checked by default', () => {
    render(<ClearBrowsingDataModal browserId="tab-1" onClose={() => {}} />)
    expect(screen.getByLabelText('Cache')).toBeChecked()
    expect(screen.getByLabelText('Cookies')).toBeChecked()
    expect(screen.getByLabelText('History')).toBeChecked()
  })

  it('clicking Clear with everything checked clears cache, cookies, and history, then closes', async () => {
    useBrowserRecentStore.getState().recordVisit('https://example.com', 'Example')
    useBrowserClosedTabsStore.getState().recordClosed('https://closed.com', 'Closed')
    const onClose = vi.fn()
    render(<ClearBrowsingDataModal browserId="tab-1" onClose={onClose} />)

    fireEvent.click(screen.getByText('Clear'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.api.browserViewClearCache).toHaveBeenCalledWith('tab-1')
    expect(window.api.browserViewClearCookies).toHaveBeenCalledWith('tab-1')
    expect(useBrowserRecentStore.getState().entries).toEqual([])
    expect(useBrowserClosedTabsStore.getState().entries).toEqual([])
  })

  it('unchecking a box skips that clear action', async () => {
    useBrowserRecentStore.getState().recordVisit('https://example.com', 'Example')
    render(<ClearBrowsingDataModal browserId="tab-1" onClose={() => {}} />)

    fireEvent.click(screen.getByLabelText('Cache'))
    fireEvent.click(screen.getByLabelText('Cookies'))
    fireEvent.click(screen.getByText('Clear'))

    await waitFor(() => expect(useBrowserRecentStore.getState().entries).toEqual([]))
    expect(window.api.browserViewClearCache).not.toHaveBeenCalled()
    expect(window.api.browserViewClearCookies).not.toHaveBeenCalled()
  })

  it('Clear is disabled when nothing is checked', () => {
    render(<ClearBrowsingDataModal browserId="tab-1" onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Cache'))
    fireEvent.click(screen.getByLabelText('Cookies'))
    fireEvent.click(screen.getByLabelText('History'))
    expect(screen.getByText('Clear')).toBeDisabled()
  })

  it('Cancel calls onClose without clearing anything', () => {
    const onClose = vi.fn()
    render(<ClearBrowsingDataModal browserId="tab-1" onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(window.api.browserViewClearCache).not.toHaveBeenCalled()
  })
})
