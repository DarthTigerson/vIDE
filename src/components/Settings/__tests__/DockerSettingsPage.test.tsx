/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DockerSettingsPage } from '../DockerSettingsPage'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'

afterEach(() => {
  cleanup()
  useDockerSettingsStore.setState({
    enabled: false, showBadge: true, badgeMode: 'containers', showMemory: false, memoryFormat: 'usedPercent',
  })
})

describe('DockerSettingsPage', () => {
  it('renders the Enable Docker toggle off by default', () => {
    render(<DockerSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Enable Docker' })
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('clicking the toggle enables Docker in the store', () => {
    render(<DockerSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Docker' }))
    expect(useDockerSettingsStore.getState().enabled).toBe(true)
  })

  it('renders the Show running count toggle on by default, with the Count dropdown visible defaulting to containers', () => {
    render(<DockerSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Show running count' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Count' })).toBeTruthy()
  })

  it('hides the Count dropdown when Show running count is switched off', () => {
    render(<DockerSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show running count' }))
    expect(useDockerSettingsStore.getState().showBadge).toBe(false)
    expect(screen.queryByRole('button', { name: 'All running containers' })).toBeNull()
  })

  it('selecting "All running projects" updates badgeMode in the store', () => {
    render(<DockerSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Count' }))
    fireEvent.click(screen.getByRole('option', { name: 'All running projects' }))
    expect(useDockerSettingsStore.getState().badgeMode).toBe('projects')
  })

  it('renders the Show memory usage toggle off by default, with no Format dropdown', () => {
    render(<DockerSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Show memory usage' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: 'Format' })).toBeNull()
  })

  it('shows the Format dropdown once Show memory usage is switched on, defaulting to Used %', () => {
    render(<DockerSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show memory usage' }))
    expect(useDockerSettingsStore.getState().showMemory).toBe(true)
    expect(screen.getByRole('button', { name: 'Format' })).toBeTruthy()
  })

  it('selecting "Used / limit" updates memoryFormat in the store', () => {
    render(<DockerSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show memory usage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(screen.getByRole('option', { name: /Used \/ limit/ }))
    expect(useDockerSettingsStore.getState().memoryFormat).toBe('usedOverLimit')
  })
})
