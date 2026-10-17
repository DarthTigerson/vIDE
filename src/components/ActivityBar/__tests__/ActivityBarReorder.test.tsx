import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar, APP_DRAG_MIME } from '../ActivityBar'

const item = (id: string, dragId?: string, extra: object = {}) => ({ id, icon: <span>{id}</span>, title: id, active: false, onClick: () => {}, dragId, ...extra })

function dataTransfer(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial }
  return {
    setData: (k: string, v: string) => { data[k] = v },
    getData: (k: string) => data[k] ?? '',
    get types() { return Object.keys(data) },
    effectAllowed: '',
    dropEffect: '',
  }
}

describe('ActivityBar drag reorder', () => {
  it('only items with a dragId are draggable', () => {
    render(<ActivityBar side="right" groups={[[item('a', 'a'), item('plus')]]} onReorder={() => {}} />)
    expect(screen.getByLabelText('a').getAttribute('draggable')).toBe('true')
    expect(screen.getByLabelText('plus').getAttribute('draggable')).not.toBe('true')
  })

  it('dropping on the lower half of a target reports placement after', () => {
    const onReorder = vi.fn()
    render(<ActivityBar side="right" groups={[[item('a', 'a'), item('b', 'b')]]} onReorder={onReorder} />)
    const a = screen.getByLabelText('a')
    const b = screen.getByLabelText('b')
    b.getBoundingClientRect = () => ({ top: 100, height: 48, bottom: 148, left: 0, right: 48, width: 48, x: 0, y: 100, toJSON: () => ({}) })
    const dt = dataTransfer()
    fireEvent.dragStart(a, { dataTransfer: dt })
    fireEvent.dragOver(b, { dataTransfer: dt, clientY: 140 })
    fireEvent.drop(b, { dataTransfer: dt, clientY: 140 })
    expect(onReorder).toHaveBeenCalledWith('a', 'b', 'after')
  })

  it('dropping an item onto itself does nothing', () => {
    const onReorder = vi.fn()
    render(<ActivityBar side="right" groups={[[item('a', 'a')]]} onReorder={onReorder} />)
    const a = screen.getByLabelText('a')
    const dt = dataTransfer()
    fireEvent.dragStart(a, { dataTransfer: dt })
    fireEvent.drop(a, { dataTransfer: dt, clientY: 0 })
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('accepts a drop that started outside the bar when it carries the bar\'s drag type', () => {
    const onReorder = vi.fn()
    render(<ActivityBar side="left" groups={[[item('a', 'a')]]} onReorder={onReorder} dragMime={APP_DRAG_MIME} />)
    const a = screen.getByLabelText('a')
    const dt = dataTransfer({ [APP_DRAG_MIME]: 'notes' })
    const over = fireEvent.dragOver(a, { dataTransfer: dt, clientY: 10 })
    expect(over).toBe(false) // preventDefault — the drop is allowed
    fireEvent.drop(a, { dataTransfer: dt, clientY: 10 })
    expect(onReorder).toHaveBeenCalledWith('notes', 'a', expect.any(String))
  })

  it('ignores drags of another bar\'s type', () => {
    render(<ActivityBar side="left" groups={[[item('a', 'a')]]} onReorder={() => {}} dragMime={APP_DRAG_MIME} />)
    const over = fireEvent.dragOver(screen.getByLabelText('a'), { dataTransfer: dataTransfer({ 'application/x-vide-session': 's1' }) })
    expect(over).toBe(true)
  })

  it('a dropOnly item takes drops but cannot be dragged', () => {
    render(<ActivityBar side="left" groups={[[item('apps', 'apps', { dropOnly: true })]]} onReorder={() => {}} dragMime={APP_DRAG_MIME} />)
    expect(screen.getByLabelText('apps').getAttribute('draggable')).toBe('false')
  })
})
