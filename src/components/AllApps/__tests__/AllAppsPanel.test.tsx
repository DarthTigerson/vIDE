import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AllAppsPanel, ALL_APPS_VIEW_KEY, ALL_APPS_DISABLED_OPEN_KEY } from '../AllAppsPanel'
import { APP_DRAG_MIME } from '@/components/ActivityBar/ActivityBar'

const apps = [
  { id: 'docker', title: 'Docker', icon: null, favorite: true, onOpen: vi.fn(), onSettings: vi.fn(), onDisable: vi.fn() },
  { id: 'todos', title: 'To Do', icon: null, favorite: false, badge: 2, onOpen: vi.fn(), onSettings: vi.fn(), onDisable: vi.fn() },
  { id: 'notes', title: 'Notes', icon: null, favorite: false, onOpen: vi.fn(), onSettings: vi.fn() },
]

function dataTransfer(data: Record<string, string>) {
  return { types: Object.keys(data), getData: (t: string) => data[t] ?? '', setData: vi.fn(), dropEffect: '', effectAllowed: '' }
}

function setup(open = true) {
  const onPlace = vi.fn()
  const onUnfavorite = vi.fn()
  const utils = render(<AllAppsPanel apps={apps} open={open} onPlace={onPlace} onUnfavorite={onUnfavorite} />)
  return { ...utils, onPlace, onUnfavorite }
}

describe('AllAppsPanel', () => {
  it("shows an app's badge on its row", () => {
    setup()
    expect(screen.getByText('To Do').closest('button')!.textContent).toContain('2')
    expect(screen.getByText('Notes').closest('button')!.textContent).toBe('Notes')
  })

  it('lists favorites first, and an unfavorited app goes back to its own position', () => {
    const order = () => screen.getAllByRole('button').filter((b) => b.draggable).map((b) => b.textContent)
    const list = [
      { id: 'todos', title: 'To Do', icon: null, favorite: false, onOpen: vi.fn(), onSettings: vi.fn() },
      { id: 'notes', title: 'Notes', icon: null, favorite: true, onOpen: vi.fn(), onSettings: vi.fn() },
      { id: 'docker', title: 'Docker', icon: null, favorite: false, onOpen: vi.fn(), onSettings: vi.fn() },
    ]
    const { rerender } = render(<AllAppsPanel apps={list} open onPlace={vi.fn()} onUnfavorite={vi.fn()} />)
    expect(order()).toEqual(['Notes', 'To Do', 'Docker'])

    const unstarred = list.map((app) => ({ ...app, favorite: false }))
    rerender(<AllAppsPanel apps={unstarred} open onPlace={vi.fn()} onUnfavorite={vi.fn()} />)
    expect(order()).toEqual(['To Do', 'Notes', 'Docker'])
  })

  it('lists the apps and opens one on click', () => {
    setup()
    fireEvent.click(screen.getByText('Notes'))
    expect(apps[2].onOpen).toHaveBeenCalled()
  })

  it("right-click opens a menu whose Settings and Disable call the app's handlers", () => {
    setup()
    fireEvent.contextMenu(screen.getByText('Docker'))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(apps[0].onSettings).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.contextMenu(screen.getByText('Docker'))
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    expect(apps[0].onDisable).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('highlights the right-clicked row while its menu is open', () => {
    setup()
    const row = screen.getByText('Docker').closest('button')!
    fireEvent.contextMenu(row)
    expect(row.classList).toContain('bg-white/5')
    expect(screen.getByText('Notes').closest('button')!.classList).not.toContain('bg-white/5')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(row.classList).not.toContain('bg-white/5')
  })

  it('leaves Disable out of the menu for an app without one', () => {
    setup()
    fireEvent.contextMenu(screen.getByText('Notes'))
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull()
  })

  it('filters by the search box and clears it when the panel closes', () => {
    const { rerender, onPlace, onUnfavorite } = setup()
    fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'not' } })
    expect(screen.queryByText('To Do')).toBeNull()
    expect(screen.getByText('Notes')).toBeTruthy()

    rerender(<AllAppsPanel apps={apps} open={false} onPlace={onPlace} onUnfavorite={onUnfavorite} />)
    expect((screen.getByLabelText('Search apps') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('To Do')).toBeTruthy()
  })

  it('unfavorites a favorite dragged off the bar onto the panel', () => {
    const { container, onUnfavorite } = setup()
    const panel = container.firstChild as HTMLElement
    fireEvent.dragOver(panel, { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'docker' }) })
    fireEvent.drop(panel, { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'docker' }) })
    expect(onUnfavorite).toHaveBeenCalledWith('docker')
  })

  it('ignores an unfavorited row dropped back onto the panel', () => {
    const { container, onUnfavorite } = setup()
    fireEvent.drop(container.firstChild as HTMLElement, { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'notes' }) })
    expect(onUnfavorite).not.toHaveBeenCalled()
  })

  it('drops a row on the "On the bar" section to favorite it, appended', () => {
    const { onPlace } = setup()
    const zone = screen.getByRole('region', { name: 'On the bar' })
    fireEvent.dragOver(zone, { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'notes' }) })
    fireEvent.drop(zone, { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'notes' }) })
    expect(onPlace).toHaveBeenCalledWith('notes', null)
  })

  it('drops onto a favorite to place the app before it', () => {
    const { onPlace, onUnfavorite } = setup()
    fireEvent.drop(screen.getByText('Docker'), { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'notes' }) })
    expect(onPlace).toHaveBeenCalledWith('notes', 'docker')
    expect(onUnfavorite).not.toHaveBeenCalled()
  })

  it('drops a favorite on the "More apps" section to take it off the bar', () => {
    const { onUnfavorite } = setup()
    fireEvent.drop(screen.getByRole('region', { name: 'More apps' }), { dataTransfer: dataTransfer({ [APP_DRAG_MIME]: 'docker' }) })
    expect(onUnfavorite).toHaveBeenCalledWith('docker')
  })

  it('has no star buttons', () => {
    setup()
    expect(screen.queryByLabelText(/favorites/)).toBeNull()
  })

  it('switches to icon mode and remembers it', () => {
    localStorage.removeItem(ALL_APPS_VIEW_KEY)
    const { unmount } = setup()
    const icons = screen.getByRole('button', { name: 'Icons' })
    expect(icons.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(icons)
    expect(icons.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(ALL_APPS_VIEW_KEY)).toBe('"icons"')
    unmount()

    setup()
    expect(screen.getByRole('button', { name: 'Icons' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('To Do').closest('button')!.textContent).toContain('2')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(localStorage.getItem(ALL_APPS_VIEW_KEY)).toBe('"list"')
  })

  describe('Disabled section', () => {
    const disabled = () => [
      { id: 'jira', title: 'Jira', icon: null, onEnable: vi.fn(), onSettings: vi.fn() },
      { id: 'scripts', title: 'Scripts', icon: null, onEnable: vi.fn(), onSettings: vi.fn() },
    ]
    const renderWith = (list = disabled()) => {
      render(<AllAppsPanel apps={apps} disabledApps={list} open onPlace={vi.fn()} onUnfavorite={vi.fn()} />)
      return list
    }

    it('is collapsed by default, and remembers being opened', () => {
      localStorage.removeItem(ALL_APPS_DISABLED_OPEN_KEY)
      renderWith()
      const toggle = screen.getByRole('button', { name: /Disabled/ })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(toggle.textContent).toContain('2')
      expect(screen.queryByText('Jira')).toBeNull()

      fireEvent.click(toggle)
      expect(screen.getByText('Jira')).toBeTruthy()
      expect(localStorage.getItem(ALL_APPS_DISABLED_OPEN_KEY)).toBe('true')
      fireEvent.click(toggle)
      expect(localStorage.getItem(ALL_APPS_DISABLED_OPEN_KEY)).toBe('false')
    })

    it('is hidden when no app is disabled', () => {
      renderWith([])
      expect(screen.queryByRole('region', { name: 'Disabled' })).toBeNull()
    })

    it('enables an app on click, and offers Enable and Settings on right-click', () => {
      localStorage.setItem(ALL_APPS_DISABLED_OPEN_KEY, 'true')
      const list = renderWith()
      fireEvent.click(screen.getByText('Jira'))
      expect(list[0].onEnable).toHaveBeenCalled()

      fireEvent.contextMenu(screen.getByText('Scripts'))
      expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
      expect(list[1].onSettings).toHaveBeenCalled()
      fireEvent.contextMenu(screen.getByText('Scripts'))
      fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
      expect(list[1].onEnable).toHaveBeenCalled()
    })

    it('shows matching disabled apps while searching, even when collapsed', () => {
      localStorage.removeItem(ALL_APPS_DISABLED_OPEN_KEY)
      renderWith()
      fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'jir' } })
      expect(screen.getByText('Jira')).toBeTruthy()
      expect(screen.queryByText('Scripts')).toBeNull()
    })
  })
})
