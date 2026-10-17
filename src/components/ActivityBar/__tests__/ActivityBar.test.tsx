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

  it('keeps iconOnly items as a centred icon with only the hover tooltip', () => {
    render(<ActivityBar side="left" wide groups={[[item({ id: 'new', title: 'New Session', iconOnly: true })]]} />)
    const button = screen.getByRole('button', { name: 'New Session' })
    expect(button.className).toContain('justify-center')
    expect(button.className).not.toContain('justify-start')
    // Only the tooltip carries the title, not a visible label beside the icon.
    expect(screen.getAllByText('New Session')).toHaveLength(1)
    expect(screen.getByText('New Session').className).toContain('group-hover:opacity-100')
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

describe('ActivityBar expandOnHover', () => {
  function bar(container: HTMLElement) {
    return container.firstElementChild!.firstElementChild!.firstElementChild as HTMLElement
  }

  it('reserves only the icon column and widens while hovered', () => {
    const { container } = render(<ActivityBar side="right" expandOnHover groups={[[item({ label: 'Fix redis' })]]} />)
    expect(container.firstElementChild!.className).toContain('w-12')
    expect(bar(container).className).toContain('w-12')
    fireEvent.mouseEnter(container.firstElementChild!)
    expect(bar(container).className).toContain('w-40')
    expect(container.firstElementChild!.className).toContain('w-12') // overlay, no reflow
    fireEvent.mouseLeave(container.firstElementChild!)
    expect(bar(container).className).toContain('w-12')
  })

  it('stays wide while a session is being renamed', () => {
    const rename = { initial: 'Fix redis', onCommit: vi.fn(), onCancel: vi.fn() }
    render(<ActivityBar side="right" expandOnHover groups={[[item({ label: 'Fix redis', rename })]]} />)
    expect(screen.getByRole('textbox', { name: 'Rename session' })).toBeInTheDocument()
  })
})

describe('ActivityBar edgeToggle', () => {
  it('renders a grip on the inner border that toggles the bar', () => {
    const onClick = vi.fn()
    render(<ActivityBar side="right" wide edgeToggle={{ label: 'Collapse session names', onClick }} groups={[[item({ label: 'Fix redis' })]]} />)
    const grip = screen.getByRole('button', { name: 'Collapse session names' })
    expect(grip.className).toContain('-left-1.5')
    fireEvent.click(grip)
    expect(onClick).toHaveBeenCalled()
  })
})
