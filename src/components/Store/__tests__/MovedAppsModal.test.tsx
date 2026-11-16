import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MovedAppsModal } from '../MovedAppsModal'
import { useStoreStore } from '@/stores/storeStore'
import { useAppContribStore } from '@/apps/appContribStore'
import type { RegistryState } from '@/types/api'

const registry: RegistryState = {
  status: 'ok', checkedAt: 1, fromCache: false, languageServers: [],
  apps: [{
    id: 'docker', name: 'Docker', description: 'd', repo: 'o/r', firstParty: true, compatible: true,
    recommended: false, category: 'applications', targets: ['vide'], replacesBuiltIn: 'docker',
    latest: { version: '1.0.0', commit: 'a'.repeat(40), url: 'u', sha256: 'b'.repeat(64), minVide: '0.4.0' },
  }],
}

describe('MovedAppsModal', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('vide:docker:enabled', 'true')
    useAppContribStore.setState({ apps: [] })
    useStoreStore.setState({ registry, busy: {}, errors: {}, movedNoticeDismissed: false, movedNoticeOpen: true })
  })

  it('renders nothing while closed', () => {
    useStoreStore.setState({ movedNoticeOpen: false })
    render(<MovedAppsModal />)
    expect(screen.queryByText('Some apps moved to the Store')).toBeNull()
  })

  it('lists each app; Install all installs them', () => {
    const install = vi.fn()
    useStoreStore.setState({ install })
    render(<MovedAppsModal />)
    expect(screen.getByText('Some apps moved to the Store')).toBeInTheDocument()
    expect(screen.getByText('Docker')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Install all' }))
    expect(install).toHaveBeenCalledWith('docker')
  })

  it('Dismiss is remembered and closes the modal', () => {
    render(<MovedAppsModal />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useStoreStore.getState().movedNoticeDismissed).toBe(true)
    expect(useStoreStore.getState().movedNoticeOpen).toBe(false)
    expect(localStorage.getItem('vide:store:movedNoticeDismissed')).toBe('true')
  })

  it('clears itself for good once every listed app is installed', () => {
    render(<MovedAppsModal />)
    useAppContribStore.setState({
      apps: [{ id: 'docker', name: 'Docker', version: '1.0.0', source: 'store', rendererUrl: '', hasMain: false, contributes: {}, status: 'loaded' } as never],
    })
    // re-render happens via store subscription
    return Promise.resolve().then(() => {
      expect(useStoreStore.getState().movedNoticeDismissed).toBe(true)
    })
  })
})
