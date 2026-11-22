import { describe, it, expect } from 'vitest'
import { VOICES, engineAsset, lengthScale, synthArgs, voiceUrl } from '../tts/catalog'

describe('engineAsset', () => {
  it('has an asset for macOS arm64', () => {
    expect(engineAsset('darwin', 'arm64')?.url).toContain('osx-arm64')
  })
  it('has an asset for Linux x64', () => {
    expect(engineAsset('linux', 'x64')?.url).toContain('linux-x64')
  })
  it('has none for Intel macOS or Windows', () => {
    expect(engineAsset('darwin', 'x64')).toBeNull()
    expect(engineAsset('win32', 'x64')).toBeNull()
  })
})

describe('lengthScale', () => {
  it('is the inverse of speed', () => {
    expect(lengthScale(1)).toBe(1)
    expect(lengthScale(1.25)).toBe(0.8)
  })
  it('clamps speed to 0.7-1.5', () => {
    expect(lengthScale(0.1)).toBe(lengthScale(0.7))
    expect(lengthScale(10)).toBe(lengthScale(1.5))
    expect(lengthScale(1.5)).toBe(0.67)
  })
  it('treats NaN as 1', () => {
    expect(lengthScale(NaN)).toBe(1)
  })
})

describe('synthArgs', () => {
  const voice = VOICES[0]
  const args = synthArgs('/v/dir', voice, 1.25, '/tmp/out.wav', 'Hello world')

  it('builds the model flags', () => {
    expect(args).toContain(`--vits-model=/v/dir/${voice.model}.onnx`)
    expect(args).toContain('--vits-tokens=/v/dir/tokens.txt')
    expect(args).toContain('--vits-data-dir=/v/dir/espeak-ng-data')
    expect(args).toContain('--vits-length-scale=0.8')
    expect(args).toContain('--output-filename=/tmp/out.wav')
  })

  it('passes the text last, unquoted', () => {
    expect(args[args.length - 1]).toBe('Hello world')
  })
})

describe('VOICES', () => {
  it('has unique ids', () => {
    const ids = VOICES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('downloads vits-piper-<model>.tar.bz2', () => {
    for (const v of VOICES) expect(voiceUrl(v).endsWith(`vits-piper-${v.model}.tar.bz2`)).toBe(true)
  })
})
