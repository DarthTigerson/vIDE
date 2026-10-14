import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ActivityBar, type ActivityBarItem } from '../ActivityBar'

afterEach(cleanup)

function item(overrides: Partial<ActivityBarItem> = {}): ActivityBarItem {
  return { id: 'a', icon: <span>i</span>, title: 'Claude Code', active: false, onClick: vi.fn(), ...overrides }
}

describe('ActivityBar wide mode', () => {
  it('renders visible labels and widens the bar', () => {
    const { container } = render(
      <ActivityBar side="left" wide groups={[[item({ label: 'Fix redis' }), item({ id: 'b', label: 'Write tests' })]]} />,
    )
    expect(screen.getAllByText('Fix redis').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Write tests').length).toBeGreaterThan(0)
    expect(container.firstElementChild!.className).toContain('w-40')
    expect(container.firstElementChild!.className).not.toContain('w-12')
  })

  it('names the button after its label so sessions are distinguishable to screen readers', () => {
    render(<ActivityBar side="left" wide groups={[[item({ label: 'Fix redis' })]]} />)
    expect(screen.getByRole('button', { name: 'Fix redis' })).toBeTruthy()
  })

  it('stays a narrow icon bar without wide, even if labels are set', () => {
    const { container } = render(<ActivityBar side="left" groups={[[item({ label: 'Fix redis' })]]} />)
    expect(container.firstElementChild!.className).toContain('w-12')
  })
})

describe('ActivityBar inline rename', () => {
  function renderRenaming() {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(
      <ActivityBar
        side="left"
        wide
        groups={[[item({ label: 'Fix redis', rename: { initial: 'Fix redis', onCommit, onCancel } })]]}
      />,
    )
    const input = screen.getByRole('textbox', { name: 'Rename session' }) as HTMLInputElement
    return { input, onCommit, onCancel }
  }

  it('shows a focused input prefilled with the current name', () => {
    const { input } = renderRenaming()
    expect(input.value).toBe('Fix redis')
    expect(document.activeElement).toBe(input)
  })

  it('commits the typed value on Enter', () => {
    const { input, onCommit, onCancel } = renderRenaming()
    fireEvent.change(input, { target: { value: 'Redis fix' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Redis fix')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels on Escape without committing', () => {
    const { input, onCommit, onCancel } = renderRenaming()
    fireEvent.change(input, { target: { value: 'nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits on blur, like clicking away from a rename in a file tree', () => {
    const { input, onCommit } = renderRenaming()
    fireEvent.change(input, { target: { value: 'Blurred' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('Blurred')
  })
})

describe('ActivityBar collapsed (narrow) with labels', () => {
  it('uses the label as the tooltip and accessible name so session names stay reachable', () => {
    const { container } = render(<ActivityBar side="right" groups={[[item({ label: 'Fix redis' })]]} />)
    const button = screen.getByRole('button', { name: 'Fix redis' })
    expect(button.textContent).toContain('Fix redis') // tooltip span
    expect(container.firstElementChild!.className).toContain('w-12')
  })
})
