import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  ;(global as any).document = {
    documentElement: {
      style: { setProperty: () => {} },
      setAttribute: () => {},
    },
  }
  ;(globalThis as any).window = {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }
  return { localStorageStore }
})

const KEY = 'vide:editorTokenColors'

// The palette is parsed once at module load, so each stored-value case has
// to re-import the store rather than just setState.
async function loadStore(stored?: string, theme?: string) {
  for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]
  if (stored !== undefined) localStorageStore[KEY] = stored
  if (theme !== undefined) localStorageStore['vide:theme'] = theme
  vi.resetModules()
  return import('../displayStore')
}

beforeEach(() => {
  for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]
})

describe('displayStore — editor token colors', () => {
  it('falls back to the stock dark palette with nothing stored', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
  })

  it('ignores unparseable JSON rather than blanking the editor', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore('not json {')
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
  })

  it('keeps valid fields and falls back per-field on a junk value', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore(
      JSON.stringify({ keyword: '#ff0000', string: 'nope', number: 42 }),
    )
    const tokens = useDisplayStore.getState().editorTokenColors
    expect(tokens.keyword).toBe('#ff0000')
    expect(tokens.string).toBe(defaultEditorTokenColors().string)
    expect(tokens.number).toBe(defaultEditorTokenColors().number)
  })

  it('persists a single edited token, leaving the others alone', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    useDisplayStore.getState().setEditorTokenColor('type', '#00ff00')
    expect(useDisplayStore.getState().editorTokenColors.type).toBe('#00ff00')
    expect(useDisplayStore.getState().editorTokenColors.string).toBe(defaultEditorTokenColors().string)
    expect(JSON.parse(localStorageStore[KEY]).type).toBe('#00ff00')
  })

  it('resets every token back to the defaults', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    useDisplayStore.getState().setEditorTokenColor('type', '#00ff00')
    useDisplayStore.getState().resetEditorTokenColors()
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
    expect(JSON.parse(localStorageStore[KEY])).toEqual(defaultEditorTokenColors())
  })

  it('seeds from the active theme\'s own base, so a light theme never starts on dark tokens', async () => {
    const dark = await loadStore(undefined, 'claude-dark')
    const light = await loadStore(undefined, 'claude-light')
    expect(dark.useDisplayStore.getState().editorTokenColors).not.toEqual(
      light.useDisplayStore.getState().editorTokenColors,
    )
    // Monaco's own stock light palette — what the editor already shows on a
    // light theme before anyone touches the picker.
    expect(light.useDisplayStore.getState().editorTokenColors.keyword).toBe('#0000ff')
  })

  it('refuses a value that is not a 6-digit hex', async () => {
    const { useDisplayStore } = await loadStore()
    const before = useDisplayStore.getState().editorTokenColors.type
    useDisplayStore.getState().setEditorTokenColor('type', 'rebeccapurple')
    useDisplayStore.getState().setEditorTokenColor('type', '#fff')
    expect(useDisplayStore.getState().editorTokenColors.type).toBe(before)
    expect(localStorageStore[KEY]).toBeUndefined()
  })

  it('reseeds from the new theme base on a theme switch, if never customized', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore(undefined, 'claude-dark')
    const { useThemeStore } = await import('../themeStore')
    useThemeStore.getState().setTheme('claude-light')
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
    expect(localStorageStore[KEY]).toBeUndefined()
  })

  it('leaves a customized palette alone across a theme switch', async () => {
    const { useDisplayStore } = await loadStore(undefined, 'claude-dark')
    const { useThemeStore } = await import('../themeStore')
    useDisplayStore.getState().setEditorTokenColor('keyword', '#123456')
    useThemeStore.getState().setTheme('claude-light')
    expect(useDisplayStore.getState().editorTokenColors.keyword).toBe('#123456')
  })

  it('hands out a fresh defaults object each call, never the shared module one', async () => {
    const { defaultEditorTokenColors } = await loadStore()
    const a = defaultEditorTokenColors()
    a.keyword = '#000000'
    expect(defaultEditorTokenColors().keyword).not.toBe('#000000')
  })
})
