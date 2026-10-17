import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AllAppsPanel } from '../AllAppsPanel'
import { APP_DRAG_MIME } from '@/components/ActivityBar/ActivityBar'

const apps = [
  { id: 'docker', title: 'Docker', icon: null, favorite: true, onOpen: vi.fn() },
  { id: 'todos', title: 'To Do', icon: null, favorite: false, onOpen: vi.fn() },
  { id: 'notes', title: 'Notes', icon: null, favorite: false, onOpen: vi.fn() },
]

function dataTransfer(data: Record<string, string>) {
  return { types: Object.keys(data), getData: (t: string) => data[t] ?? '', setData: vi.fn(), dropEffect: '', effectAllowed: '' }
}

function setup(open = true) {
  const onFavorite = vi.fn()
  const onUnfavorite = vi.fn()
  const utils = render(<AllAppsPanel apps={apps} open={open} onFavorite={onFavorite} onUnfavorite={onUnfavorite} />)
  return { ...utils, onFavorite, onUnfavorite }
}

describe('AllAppsPanel', () => {
  it('lists the apps and opens one on click', () => {
    setup()
    fireEvent.click(screen.getByText('Notes'))
    expect(apps[2].onOpen).toHaveBeenCalled()
  })

  it('filters by the search box and clears it when the panel closes', () => {
    const { rerender, onFavorite, onUnfavorite } = setup()
    fireEvent.change(screen.getByLabelText('Search apps'), { target: { value: 'not' } })
    expect(screen.queryByText('To Do')).toBeNull()
    expect(screen.getByText('Notes')).toBeTruthy()

    rerender(<AllAppsPanel apps={apps} open={false} onFavorite={onFavorite} onUnfavorite={onUnfavorite} />)
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

  it('lists favorites too, with a filled star that unfavorites', () => {
    const { onUnfavorite } = setup()
    const star = screen.getByLabelText('Remove Docker from favorites')
    expect(star.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(star)
    expect(onUnfavorite).toHaveBeenCalledWith('docker')
  })

  it('an empty star favorites the app', () => {
    const { onFavorite } = setup()
    const star = screen.getByLabelText('Add To Do to favorites')
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(onFavorite).toHaveBeenCalledWith('todos')
  })
})
