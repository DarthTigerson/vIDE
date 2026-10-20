import { describe, it, expect } from 'vitest'
import { MODEL_CATALOG, RAM_OVERHEAD_BYTES, fits, llamaAsset, recommendedModelId } from '../catalog'

const GiB = 1024 ** 3

describe('recommendedModelId', () => {
  it('recommends the 3B model from 16 GB of RAM up', () => {
    expect(recommendedModelId(16 * GiB)).toBe('qwen-3b')
  })

  it('recommends the 1.5B model below 16 GB', () => {
    expect(recommendedModelId(8 * GiB)).toBe('qwen-1.5b')
  })
})

describe('MODEL_CATALOG', () => {
  it('estimates RAM as the GGUF size plus 300 MiB', () => {
    expect(RAM_OVERHEAD_BYTES).toBe(300 * 1024 ** 2)
    expect(MODEL_CATALOG['qwen-1.5b'].ramBytes).toBe(1646573056 + 300 * 1024 ** 2)
  })

  it('lists Mellum as a managed model', () => {
    expect(MODEL_CATALOG['mellum-4b'].fileName).toBe('mellum-4b-base.Q8_0.gguf')
  })
})

describe('fits', () => {
  it('fits when the estimate is within free RAM', () => {
    expect(fits(2e9, { totalBytes: 8e9, usedBytes: 5e9 })).toBe(true)
  })

  it('does not fit when the estimate exceeds free RAM', () => {
    expect(fits(4e9, { totalBytes: 8e9, usedBytes: 5e9 })).toBe(false)
  })
})

describe('llamaAsset', () => {
  it('has no build for unsupported platforms', () => {
    expect(llamaAsset('win32')).toBeNull()
  })

  it('uses the pinned macOS arm64 tarball', () => {
    expect(llamaAsset('darwin')?.url).toMatch(/\/b11707\/llama-b11707-bin-macos-arm64\.tar\.gz$/)
  })

  it('uses the pinned Ubuntu x64 tarball on Linux', () => {
    expect(llamaAsset('linux')?.url).toMatch(/llama-b11707-bin-ubuntu-x64\.tar\.gz$/)
  })
})
