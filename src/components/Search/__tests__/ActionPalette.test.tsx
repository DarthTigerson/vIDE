import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/platform', () => ({ isMac: true }))
vi.mock('../commandRegistry', () => ({ getAllCommands: vi.fn() }))

import { ActionPalette } from '../ActionPalette'
import { getAllCommands } from '../commandRegistry'
import type { Command } from '../commands'

const input = () => screen.getByPlaceholderText('Run a command…')

function setCommands(commands: Command[]) {
  vi.mocked(getAllCommands).mockReturnValue(commands)
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})
afterEach(() => cleanup())

describe('ActionPalette', () => {
  it('filters with ranked fuzzy search', () => {
    setCommands([
      { id: 'a', label: 'Git: Pull', action: vi.fn() },
      { id: 'c', label: 'Settings: Display', description: 'Theme, panel style', action: vi.fn() },
    ])
    render(<ActionPalette onClose={() => {}} />)
    fireEvent.change(input(), { target: { value: 'set disp' } })
    expect(screen.getByText('Settings: Display')).toBeTruthy()
    expect(screen.queryByText('Git: Pull')).toBeNull()
  })

  it('Enter runs the top match and closes', () => {
    const run = vi.fn()
    const onClose = vi.fn()
    setCommands([{ id: 'a', label: 'Git: Pull', action: run }, { id: 'b', label: 'Git: Push', action: vi.fn() }])
    render(<ActionPalette onClose={onClose} />)
    fireEvent.change(input(), { target: { value: 'pull' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(run).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows recently used commands first on an empty query', () => {
    localStorage.setItem('vide:palette:recents', JSON.stringify(['c']))
    setCommands([
      { id: 'a', label: 'Git: Pull', action: vi.fn() },
      { id: 'c', label: 'Settings: Display', action: vi.fn() },
    ])
    const { container } = render(<ActionPalette onClose={() => {}} />)
    const labels = Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    expect(labels[0]).toContain('Settings: Display')
  })

  it('records a run command as recent', () => {
    setCommands([{ id: 'a', label: 'Git: Pull', action: vi.fn() }])
    render(<ActionPalette onClose={() => {}} />)
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(JSON.parse(localStorage.getItem('vide:palette:recents') ?? '[]')).toEqual(['a'])
  })

  it('greys a row with a disabledReason and does not run it', () => {
    const run = vi.fn()
    const onClose = vi.fn()
    setCommands([{ id: 'a', label: 'Git: Commit', disabledReason: () => 'Nothing staged', action: run }])
    render(<ActionPalette onClose={onClose} />)
    expect(screen.getByText('Nothing staged')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Git: Commit/ }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(run).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('marks danger commands', () => {
    setCommands([{ id: 'a', label: 'Git: Force Push', danger: true, action: vi.fn() }])
    render(<ActionPalette onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /Git: Force Push/ }).getAttribute('data-danger')).toBe('true')
  })

  it('runs a two-step command: swaps to a picker, then picks and closes', async () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    setCommands([
      {
        id: 'm',
        label: 'Git: Merge…',
        pick: async () => ({
          placeholder: 'Merge which branch?',
          emptyText: 'No branches',
          items: [{ id: 'feature', label: 'feature' }, { id: 'dev', label: 'dev' }],
          onPick,
        }),
      },
    ])
    render(<ActionPalette onClose={onClose} />)
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() => expect(screen.getByPlaceholderText('Merge which branch?')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('Merge which branch?'), { target: { value: 'dev' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Merge which branch?'), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('dev')
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape in a picker goes back to the command list instead of closing', async () => {
    const onClose = vi.fn()
    setCommands([
      { id: 'm', label: 'Git: Merge…', pick: async () => ({ placeholder: 'Pick…', emptyText: 'None', items: [], onPick: vi.fn() }) },
    ])
    render(<ActionPalette onClose={onClose} />)
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() => screen.getByPlaceholderText('Pick…'))
    fireEvent.keyDown(screen.getByPlaceholderText('Pick…'), { key: 'Escape' })
    expect(screen.getByPlaceholderText('Run a command…')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the empty text when nothing matches', () => {
    setCommands([{ id: 'a', label: 'Git: Pull', action: vi.fn() }])
    render(<ActionPalette onClose={() => {}} />)
    fireEvent.change(input(), { target: { value: 'zzzz' } })
    expect(screen.getByText('No commands matching "zzzz"')).toBeTruthy()
  })
})
