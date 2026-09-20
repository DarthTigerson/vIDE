import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRunningLlamaCount } from '../useRunningLlamaCount'
import { useLlamaModelsStore, defaultLlamaModelConfig, type LlamaModelConfig } from '@/stores/llamaModelsStore'
import { useLlamaStore } from '@/stores/llamaStore'

function model(id: string, port: number): LlamaModelConfig {
  return { ...defaultLlamaModelConfig(), id, displayName: id, host: '127.0.0.1', port }
}

const running = { running: true, output: '', error: null, exitCode: null }
const stopped = { running: false, output: '', error: null, exitCode: 0 }

let probeModel: ReturnType<typeof vi.fn>

beforeEach(() => {
  probeModel = vi.fn().mockResolvedValue(undefined)
  useLlamaModelsStore.setState({ models: [model('a', 8081), model('b', 8082), model('c', 8083)] })
  useLlamaStore.setState({ runs: {}, probeModel })
})

describe('useRunningLlamaCount', () => {
  it('counts only the models whose server is running, not every configured model', () => {
    useLlamaStore.setState({ runs: { a: running, b: stopped } }) // c has no run entry at all
    const { result } = renderHook(() => useRunningLlamaCount(true))
    expect(result.current).toBe(1)
  })

  it('is 0 when no server is running', () => {
    useLlamaStore.setState({ runs: { a: stopped } })
    const { result } = renderHook(() => useRunningLlamaCount(true))
    expect(result.current).toBe(0)
  })

  it('ignores a run left over from a model that has since been deleted', () => {
    useLlamaStore.setState({ runs: { a: running, deleted: running } })
    const { result } = renderHook(() => useRunningLlamaCount(true))
    expect(result.current).toBe(1)
  })

  it('updates live as servers start and stop', () => {
    const { result } = renderHook(() => useRunningLlamaCount(true))
    expect(result.current).toBe(0)
    act(() => useLlamaStore.setState({ runs: { a: running, b: running } }))
    expect(result.current).toBe(2)
    act(() => useLlamaStore.setState({ runs: { a: stopped, b: running } }))
    expect(result.current).toBe(1)
  })

  it('probes every configured model so servers started outside vIDE are counted without opening the panel', () => {
    renderHook(() => useRunningLlamaCount(true))
    expect(probeModel).toHaveBeenCalledTimes(3)
    expect(probeModel).toHaveBeenCalledWith('a', '127.0.0.1', 8081)
    expect(probeModel).toHaveBeenCalledWith('c', '127.0.0.1', 8083)
  })

  it('probes again when the model list changes', () => {
    renderHook(() => useRunningLlamaCount(true))
    probeModel.mockClear()
    act(() => useLlamaModelsStore.setState({ models: [model('a', 8081), model('d', 8084)] }))
    expect(probeModel).toHaveBeenCalledTimes(2)
    expect(probeModel).toHaveBeenCalledWith('d', '127.0.0.1', 8084)
  })

  it('does not probe when the Llama feature is disabled', () => {
    renderHook(() => useRunningLlamaCount(false))
    expect(probeModel).not.toHaveBeenCalled()
  })
})
