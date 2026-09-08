/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { BrowserLandingPage } from '../BrowserLandingPage'
import { useBrowserFavoritesStore } from '@/stores/browserFavoritesStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'

beforeEach(() => {
  localStorage.clear()
  useBrowserFavoritesStore.setState({ favorites: {} })
  useBrowserRecentStore.setState({ entries: [] })
  useBrowserClosedTabsStore.setState({ entries: [] })
})

afterEach(() => {
  cleanup()
})

describe('BrowserLandingPage', () => {
  it('shows the empty-favorites hint and Recent/Closed empty states with nothing saved', () => {
    const { getByText } = render(<BrowserLandingPage onNavigate={() => {}} />)
    expect(getByText('Star the address bar on any page to pin it here.')).toBeTruthy()
    expect(getByText('Nothing here yet.')).toBeTruthy()
    expect(getByText('No recently closed tabs.')).toBeTruthy()
  })

  it('lists a favorite and navigates when its row is clicked', () => {
    useBrowserFavoritesStore.getState().toggleFavorite('https://example.com', 'Example Domain')
    const onNavigate = vi.fn()
    const { getByText } = render(<BrowserLandingPage onNavigate={onNavigate} />)
    fireEvent.click(getByText('Example Domain'))
    expect(onNavigate).toHaveBeenCalledWith('https://example.com')
  })

  it('unstars a favorite from its row', () => {
    useBrowserFavoritesStore.getState().toggleFavorite('https://example.com', 'Example Domain')
    const { getByLabelText } = render(<BrowserLandingPage onNavigate={() => {}} />)
    fireEvent.click(getByLabelText('Remove Example Domain from favorites'))
    expect(useBrowserFavoritesStore.getState().isFavorite('https://example.com')).toBe(false)
  })

  it('lists a recent visit and navigates when its row is clicked', () => {
    useBrowserRecentStore.getState().recordVisit('https://example.com', 'Example Domain')
    const onNavigate = vi.fn()
    const { getByText } = render(<BrowserLandingPage onNavigate={onNavigate} />)
    fireEvent.click(getByText('Example Domain'))
    expect(onNavigate).toHaveBeenCalledWith('https://example.com')
  })

  it('lists a closed tab; clicking restore navigates and removes the entry', () => {
    useBrowserClosedTabsStore.getState().recordClosed('https://example.com', 'Example Domain')
    const onNavigate = vi.fn()
    const { getByLabelText } = render(<BrowserLandingPage onNavigate={onNavigate} />)
    fireEvent.click(getByLabelText('Reopen Example Domain'))
    expect(onNavigate).toHaveBeenCalledWith('https://example.com')
    expect(useBrowserClosedTabsStore.getState().entries).toHaveLength(0)
  })
})
