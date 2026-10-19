import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// This file tests provideInlineCompletion's own mechanics (debounce, IPC
// call, busy toggle, cancellation) in isolation from the enabled/running/
// snoozed gate, which has its own coverage in autocompleteEffectiveState.test.ts.
const isAutocompleteEffectivelyEnabled = vi.fn()
vi.mock('../autocompleteEffectiveState', () => ({
  isAutocompleteEffectivelyEnabled: () => isAutocompleteEffectivelyEnabled(),
}))

import { provideInlineCompletion } from '../monacoAutocomplete'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'

function fakeModel() {
  return {
    getLineCount: () => 1,
    getLineMaxColumn: () => 1,
    getValueInRange: () => '',
    getLanguageId: () => 'typescript',
  }
}

// A model holding real text, with the cursor at `line`, `column`.
function textModel(text: string) {
  const lines = text.split('\n')
  const offset = (l: number, c: number) => lines.slice(0, l - 1).reduce((n, x) => n + x.length + 1, 0) + c - 1
  return {
    getLineCount: () => lines.length,
    getLineMaxColumn: (l: number) => lines[l - 1].length + 1,
    getValueInRange: (r: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) =>
      text.slice(offset(r.startLineNumber, r.startColumn), offset(r.endLineNumber, r.endColumn)),
    getLanguageId: () => 'typescript',
  }
}

function fakeToken(cancelled = false) {
  return { isCancellationRequested: cancelled }
}

describe('provideInlineCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    isAutocompleteEffectivelyEnabled.mockReset().mockReturnValue(true)
    useAutocompleteRuntimeStore.setState({ busy: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns no items immediately when the effective-enabled gate is false', async () => {
    isAutocompleteEffectivelyEnabled.mockReturnValue(false)
    ;(global as any).window = { api: { autocompleteComplete: vi.fn() } }

    const result = await provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())

    expect(result).toEqual([])
    expect(window.api.autocompleteComplete).not.toHaveBeenCalled()
  })

  it('returns no items if the gate flips to false during the debounce wait', async () => {
    const apiMock = vi.fn().mockResolvedValue('x')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    isAutocompleteEffectivelyEnabled.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('returns no items if cancelled during the debounce wait', async () => {
    const token = fakeToken(false)
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue('x') } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, token)
    token.isCancellationRequested = true
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
    expect(window.api.autocompleteComplete).not.toHaveBeenCalled()
  })

  it('calls the IPC bridge after the debounce and returns an insertable item', async () => {
    const apiMock = vi.fn().mockResolvedValue('console.log()')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 3, column: 5 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    const result = await promise

    expect(apiMock).toHaveBeenCalledWith(expect.objectContaining({ prefix: '', suffix: '' }))
    expect(result).toEqual([{
      insertText: 'console.log()',
      range: { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 5 },
    }])
  })

  it('toggles the busy status store around the IPC call', async () => {
    let busyDuringCall = false
    const apiMock = vi.fn().mockImplementation(async () => {
      busyDuringCall = useAutocompleteRuntimeStore.getState().busy
      return 'x'
    })
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await promise

    expect(busyDuringCall).toBe(true)
    expect(useAutocompleteRuntimeStore.getState().busy).toBe(false)
  })

  it('returns no items when the completion result is null', async () => {
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue(null) } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
  })

  it('resolves to no items (not a rejection) when the IPC call rejects, and still resets busy', async () => {
    const apiMock = vi.fn().mockRejectedValue(new Error('renderer/main IPC failure'))
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)

    await expect(promise).resolves.toEqual([])
    expect(useAutocompleteRuntimeStore.getState().busy).toBe(false)
  })

  it('waits for typing to pause: nothing is sent before 150ms', async () => {
    const apiMock = vi.fn().mockResolvedValue('x')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(100)
    expect(apiMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    await promise
    expect(apiMock).toHaveBeenCalledTimes(1)
  })

  it('sends the file path and snippets from the other open files', async () => {
    useFileStore.setState({ projectRoot: '/p' })
    useEditorStore.setState({
      activeTabPath: '/p/src/Panel.tsx',
      tabs: [
        { path: '/p/src/Panel.tsx', content: 'openTab(tab', dirty: false },
        { path: '/p/src/store.ts', content: 'export function openTab(tab: Tab) {\n}', dirty: false },
        { path: 'settings://Editor', content: '', dirty: false },
      ] as never,
    })
    const apiMock = vi.fn().mockResolvedValue('x')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }
    const promise = provideInlineCompletion(textModel('openTab(tab'), { lineNumber: 1, column: 12 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await promise
    expect(apiMock).toHaveBeenCalledWith({
      prefix: 'openTab(tab', suffix: '', filePath: '/p/src/Panel.tsx',
      extra: [{ filename: 'src/store.ts', text: 'export function openTab(tab: Tab) {\n}' }],
    })
  })

  it('keeps showing the rest of a suggestion while you type it, without asking again', async () => {
    useEditorStore.setState({ activeTabPath: '/p/a.ts', tabs: [] as never })
    const apiMock = vi.fn().mockResolvedValue('tems.length')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }
    const first = provideInlineCompletion(textModel('const n = i'), { lineNumber: 1, column: 12 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await first
    const typed = await provideInlineCompletion(textModel('const n = ite'), { lineNumber: 1, column: 14 }, fakeToken())
    expect(typed).toEqual([{ insertText: 'ms.length', range: { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 14 } }])
    expect(apiMock).toHaveBeenCalledTimes(1)
  })

  it('asks again once the typing leaves the suggestion', async () => {
    useEditorStore.setState({ activeTabPath: '/p/a.ts', tabs: [] as never })
    const apiMock = vi.fn().mockResolvedValue('tems.length')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }
    const first = provideInlineCompletion(textModel('const n = i'), { lineNumber: 1, column: 12 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await first
    const second = provideInlineCompletion(textModel('const n = iz'), { lineNumber: 1, column: 13 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await second
    expect(apiMock).toHaveBeenCalledTimes(2)
  })
})
