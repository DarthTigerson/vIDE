import { describe, it, expect, vi } from 'vitest'
import { buildMarkedCommand, findMarker, cleanScriptOutput, waitForScriptResult, formatRunResult } from '../scriptRun'

const ESC = '\x1b'
const BEL = '\x07'

describe('buildMarkedCommand', () => {
  it('appends a printf of $? with the token after the normalized body', () => {
    expect(buildMarkedCommand('echo hi\r\n', 'tok')).toBe(`echo hi\nprintf '\\033]6973;tok;%s\\007' "$?"\n`)
  })
})

describe('findMarker', () => {
  it('ignores the shell echo of the printf line and finds the real sequence', () => {
    const echoed = `$ printf '\\033]6973;tok;%s\\007' "$?"\r\n`
    expect(findMarker(echoed, 'tok')).toBeNull()
    expect(findMarker(echoed + `${ESC}]6973;tok;1${BEL}`, 'tok')).toBe(1)
  })

  it('ignores markers for a different token', () => {
    expect(findMarker(`${ESC}]6973;other;0${BEL}`, 'tok')).toBeNull()
  })
})

describe('cleanScriptOutput', () => {
  it('strips colors, the marker and the echoed printf line', () => {
    const raw = `echo hi\r\n${ESC}[31mhi${ESC}[0m\r\n$ printf '\\033]6973;tok;%s\\007' "$?"\r\n${ESC}]6973;tok;0${BEL}`
    expect(cleanScriptOutput(raw, 'tok')).toBe('echo hi\nhi')
  })

  it('keeps only the last 200 lines', () => {
    const raw = Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n')
    const out = cleanScriptOutput(raw, 'tok').split('\n')
    expect(out).toHaveLength(200)
    expect(out[0]).toBe('line 50')
  })
})

function fakeSource() {
  let data: (d: string) => void = () => {}
  let exit: () => void = () => {}
  const unsubscribe = vi.fn()
  return {
    subscribe: (onData: (d: string) => void, onExit: () => void) => { data = onData; exit = onExit; return unsubscribe },
    emit: (d: string) => data(d),
    exit: () => exit(),
    unsubscribe,
  }
}

describe('waitForScriptResult', () => {
  it('resolves done with the exit code and output, then unsubscribes', async () => {
    const src = fakeSource()
    const p = waitForScriptResult({ subscribe: src.subscribe, token: 'tok', timeoutMs: 1000 })
    src.emit('ok\r\n')
    src.emit(`${ESC}]6973;tok;`)
    src.emit(`2${BEL}`)
    await expect(p).resolves.toEqual({ status: 'done', exitCode: 2, output: 'ok' })
    expect(src.unsubscribe).toHaveBeenCalled()
  })

  it('resolves exited when the terminal goes away first', async () => {
    const src = fakeSource()
    const p = waitForScriptResult({ subscribe: src.subscribe, token: 'tok', timeoutMs: 1000 })
    src.emit('partial')
    src.exit()
    await expect(p).resolves.toEqual({ status: 'exited', output: 'partial' })
  })

  it('resolves timeout after timeoutMs', async () => {
    vi.useFakeTimers()
    const src = fakeSource()
    const p = waitForScriptResult({ subscribe: src.subscribe, token: 'tok', timeoutMs: 1000 })
    src.emit('still going')
    vi.advanceTimersByTime(1000)
    await expect(p).resolves.toEqual({ status: 'timeout', output: 'still going' })
    vi.useRealTimers()
  })
})

describe('formatRunResult', () => {
  const script = { title: 'Pre-commit', shareOutput: true }
  it('shares output when allowed', () => {
    expect(formatRunResult(script, { status: 'done', exitCode: 0, output: 'all good' }))
      .toBe('Script "Pre-commit" finished with exit code 0 (success).\n\nOutput:\nall good')
  })
  it('hides output when not shared, saying so', () => {
    const text = formatRunResult({ ...script, shareOutput: false }, { status: 'done', exitCode: 1, output: 'TOP SECRET' })
    expect(text).not.toContain('TOP SECRET')
    expect(text).toBe('Script "Pre-commit" finished: failure (exit code 1). Output is hidden for this script — ask the user to check terminal "Pre-commit" if you need details.')
  })
  it('reports timeout and early exit', () => {
    expect(formatRunResult({ ...script, shareOutput: false }, { status: 'timeout', output: 'x' }))
      .toBe('Script "Pre-commit" is still running in its terminal after 10 minutes; stopped waiting.')
    expect(formatRunResult(script, { status: 'timeout', output: 'x' }))
      .toBe('Script "Pre-commit" is still running in its terminal after 10 minutes; stopped waiting.\n\nOutput so far:\nx')
    expect(formatRunResult(script, { status: 'exited', output: '' }))
      .toBe('The terminal running "Pre-commit" closed before the script finished.')
  })
})

describe('waitForScriptResult robustness', () => {
  it('resolves not-started when the terminal prints nothing before the start deadline', async () => {
    vi.useFakeTimers()
    const src = fakeSource()
    const p = waitForScriptResult({ subscribe: src.subscribe, token: 'tok', timeoutMs: 600000, startTimeoutMs: 20000 })
    vi.advanceTimersByTime(20000)
    await expect(p).resolves.toEqual({ status: 'not-started' })
    expect(src.unsubscribe).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('finds a marker split across chunks after lots of output, without keeping it all', async () => {
    const src = fakeSource()
    const p = waitForScriptResult({ subscribe: src.subscribe, token: 'tok', timeoutMs: 1000 })
    const chunk = 'x'.repeat(1023) + '\n'
    for (let i = 0; i < 2000; i++) src.emit(chunk) // ~2 MB
    src.emit(`${ESC}]69`)
    src.emit(`73;tok;0${BEL}`)
    const result = await p
    expect(result).toMatchObject({ status: 'done', exitCode: 0 })
    expect((result as { output: string }).output.length).toBeLessThanOrEqual(32768)
  })

  it('formats not-started as nothing ran', () => {
    expect(formatRunResult({ title: 'A', shareOutput: true }, { status: 'not-started' }))
      .toBe('The terminal for "A" never started; nothing was run.')
  })
})
