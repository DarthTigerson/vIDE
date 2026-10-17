import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityBar } from '../ActivityBar'

const item = (id: string, dragId?: string) => ({ id, icon: <span>{id}</span>, title: id, active: false, onClick: () => {}, dragId })

function dataTransfer() {
  const data: Record<string, string> = {}
  return { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', effectAllowed: '', dropEffect: '' }
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
})
