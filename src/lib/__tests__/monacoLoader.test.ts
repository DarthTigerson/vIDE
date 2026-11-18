import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const config = vi.fn()
vi.mock('@monaco-editor/react', () => ({ loader: { config: (...a: unknown[]) => config(...a) } }))

describe('monacoLoader', () => {
  it('points the CDN loader at the installed monaco-editor version', async () => {
    const { MONACO_VERSION, MONACO_VS_PATH } = await import('../monacoLoader')
    const installed = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/monaco-editor/package.json'), 'utf-8')).version
    expect(MONACO_VERSION).toBe(installed)
    expect(config).toHaveBeenCalledWith({ paths: { vs: MONACO_VS_PATH } })
    expect(MONACO_VS_PATH).toBe(`https://cdn.jsdelivr.net/npm/monaco-editor@${installed}/min/vs`)
  })
})
