import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewSessionMenu } from '../NewSessionMenu'

vi.mock('@/lib/nativeViewCover', () => ({ useCoverNativeViews: () => {} }))

const anchor = { left: 900, right: 948, top: 40, bottom: 88, width: 48, height: 48, x: 900, y: 40, toJSON: () => ({}) } as DOMRect
const options = [
  { kind: 'claude', label: 'Claude Code' },
  { kind: 'llama:q1', label: 'Qwen 32B', running: true },
  { kind: 'llama:g1', label: 'Gemma', running: false },
]

describe('NewSessionMenu', () => {
  it('lists every option and marks running llama servers', () => {
    render(<NewSessionMenu anchor={anchor} side="right" options={options} onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('menuitem', { name: /Claude Code/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Qwen 32B/ }).querySelector('[data-running]')).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: /Gemma/ }).querySelector('[data-running]')).toBeNull()
  })

  it('picking a row reports its kind and closes', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<NewSessionMenu anchor={anchor} side="right" options={options} onPick={onPick} onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Qwen 32B/ }))
    expect(onPick).toHaveBeenCalledWith('llama:q1')
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape and outside clicks close it', () => {
    const onClose = vi.fn()
    render(<NewSessionMenu anchor={anchor} side="right" options={options} onPick={() => {}} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(window)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says so when nothing is enabled', () => {
    render(<NewSessionMenu anchor={anchor} side="right" options={[]} onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByText('No agents enabled — turn one on in Settings')).toBeInTheDocument()
  })
})
