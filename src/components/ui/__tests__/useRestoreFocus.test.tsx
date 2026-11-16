import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { useRestoreFocus } from '@/lib/useRestoreFocus'

function Overlay({ name }: { name: string }) {
  useRestoreFocus()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <input aria-label={name} ref={ref} />
}

let host: { set: (v: 'none' | 'palette' | 'confirm') => void }
function Host() {
  const [open, setOpen] = useState<'none' | 'palette' | 'confirm'>('none')
  host = { set: setOpen }
  return (
    <>
      <textarea aria-label="terminal" />
      <textarea aria-label="editor" />
      {open === 'palette' && <Overlay name="palette" />}
      {open === 'confirm' && <Overlay name="confirm" />}
    </>
  )
}

const flushFrame = () => act(async () => { vi.runAllTimers() })
const el = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLElement

// StrictMode on purpose: dev mounts each overlay twice, the second time after
// its input already took focus (the bug the first version had in the app).
describe('useRestoreFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
    render(<StrictMode><Host /></StrictMode>)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('hands focus back to the terminal when the palette closes', async () => {
    el('terminal').focus()
    act(() => host.set('palette'))
    expect(document.activeElement).toBe(el('palette'))
    act(() => host.set('none'))
    await flushFrame()
    expect(document.activeElement).toBe(el('terminal'))
  })

  it('leaves focus where a command moved it', async () => {
    el('terminal').focus()
    act(() => host.set('palette'))
    act(() => host.set('none'))
    el('editor').focus()
    await flushFrame()
    expect(document.activeElement).toBe(el('editor'))
  })

  it('a confirm opened by the palette inherits the target and restores it when it closes', async () => {
    el('editor').focus()
    act(() => host.set('palette'))
    act(() => host.set('confirm'))
    await flushFrame()
    expect(document.activeElement).toBe(el('confirm'))
    act(() => host.set('none'))
    await flushFrame()
    expect(document.activeElement).toBe(el('editor'))
  })
})
