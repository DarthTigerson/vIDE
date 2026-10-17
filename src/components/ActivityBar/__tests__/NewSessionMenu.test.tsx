import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewSessionMenu } from '../NewSessionMenu'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'

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

  it('always offers Terminal last, even with no agents enabled', () => {
    const onPick = vi.fn()
    render(<NewSessionMenu anchor={anchor} side="right" options={[]} onPick={onPick} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Terminal' }))
    expect(onPick).toHaveBeenCalledWith('terminal')
  })

  it('puts Terminal after the agents', () => {
    render(<NewSessionMenu anchor={anchor} side="right" options={options} onPick={() => {}} onClose={() => {}} />)
    const names = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(names.at(-1)).toBe('Terminal')
  })

  it('has a Scripts submenu under Terminal; picking a script reports it and closes', () => {
    useScriptsSettingsStore.setState({ enabled: true })
    const script = { id: 's1', title: 'Pre Commit', description: '', body: 'pre-commit run', shareOutput: true, createdAt: 1, updatedAt: 1 }
    useScriptsStore.setState({ scripts: [script], tags: {} })
    const onPickScript = vi.fn()
    const onClose = vi.fn()
    render(<NewSessionMenu anchor={anchor} side="right" options={options} onPick={() => {}} onPickScript={onPickScript} onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Scripts' })
    const rows = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(rows[rows.length - 1]).toContain('Terminal')
    fireEvent.mouseEnter(trigger.parentElement!)
    fireEvent.click(screen.getByRole('button', { name: 'Pre Commit' }))
    expect(onPickScript).toHaveBeenCalledWith(script)
    expect(onClose).toHaveBeenCalled()
  })
})
