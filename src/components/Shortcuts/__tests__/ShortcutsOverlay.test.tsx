import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ShortcutsOverlay } from '../ShortcutsOverlay'

afterEach(() => cleanup())

describe('ShortcutsOverlay', () => {
  it('renders every category and shortcut label', () => {
    render(<ShortcutsOverlay />)

    expect(screen.getByText('Navigation')).toBeTruthy()
    expect(screen.getByText('Editor')).toBeTruthy()
    expect(screen.getByText('Project')).toBeTruthy()
    expect(screen.getByText('Toggle Sidebar')).toBeTruthy()
    expect(screen.getByText('Split Pane Vertical')).toBeTruthy()
    expect(screen.getByText('Open Project')).toBeTruthy()
    expect(screen.getByText('Send Selection to Chat / Show Chat')).toBeTruthy()
  })

  it('renders one key cap per shortcut key, including shift symbols', () => {
    render(<ShortcutsOverlay />)

    expect(screen.getAllByText('⌘')).toHaveLength(28)
    expect(screen.getAllByText('⇧').length).toBeGreaterThan(0)
  })
})
