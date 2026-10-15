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
  it('falls back to the stock palette for each base with nothing stored', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
    // Monaco's own stock colours per base — what the editor already shows
    // before anyone touches the picker.
    expect(useDisplayStore.getState().editorTokenColors['vs'].keyword).toBe('#0000ff')
    expect(useDisplayStore.getState().editorTokenColors['vs-dark'].keyword).toBe('#569cd6')
  })

  it('ignores unparseable JSON rather than blanking the editor', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore('not json {')
    expect(useDisplayStore.getState().editorTokenColors).toEqual(defaultEditorTokenColors())
  })

  it('keeps valid fields and falls back per-field on a junk value', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore(
      JSON.stringify({ 'vs': { keyword: '#ff0000', string: 'nope', number: 42 } }),
    )
    const light = useDisplayStore.getState().editorTokenColors['vs']
    expect(light.keyword).toBe('#ff0000')
    expect(light.string).toBe(defaultEditorTokenColors()['vs'].string)
    expect(light.number).toBe(defaultEditorTokenColors()['vs'].number)
    expect(useDisplayStore.getState().editorTokenColors['vs-dark']).toEqual(defaultEditorTokenColors()['vs-dark'])
  })

  it('migrates a pre-split flat palette to the dark set, leaving light on its defaults', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore(
      JSON.stringify({ keyword: '#fafafa', string: '#ffffff', number: '#43b600', type: '#ffffff', comment: '#6a9955' }),
    )
    const sets = useDisplayStore.getState().editorTokenColors
    expect(sets['vs-dark']).toEqual({ keyword: '#fafafa', string: '#ffffff', number: '#43b600', type: '#ffffff', comment: '#6a9955' })
    expect(sets['vs']).toEqual(defaultEditorTokenColors()['vs'])
  })

  it('persists a single edited token for one base, leaving the other base alone', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    useDisplayStore.getState().setEditorTokenColor('vs', 'type', '#00ff00')
    const sets = useDisplayStore.getState().editorTokenColors
    expect(sets['vs'].type).toBe('#00ff00')
    expect(sets['vs'].string).toBe(defaultEditorTokenColors()['vs'].string)
    expect(sets['vs-dark']).toEqual(defaultEditorTokenColors()['vs-dark'])
    expect(JSON.parse(localStorageStore[KEY])['vs'].type).toBe('#00ff00')
  })

  it('resets only the given base back to its defaults', async () => {
    const { useDisplayStore, defaultEditorTokenColors } = await loadStore()
    useDisplayStore.getState().setEditorTokenColor('vs', 'type', '#00ff00')
    useDisplayStore.getState().setEditorTokenColor('vs-dark', 'type', '#123456')
    useDisplayStore.getState().resetEditorTokenColors('vs')
    const sets = useDisplayStore.getState().editorTokenColors
    expect(sets['vs']).toEqual(defaultEditorTokenColors()['vs'])
    expect(sets['vs-dark'].type).toBe('#123456')
    expect(JSON.parse(localStorageStore[KEY])).toEqual(sets)
  })

  it('refuses a value that is not a 6-digit hex', async () => {
    const { useDisplayStore } = await loadStore()
    const before = useDisplayStore.getState().editorTokenColors['vs-dark'].type
    useDisplayStore.getState().setEditorTokenColor('vs-dark', 'type', 'rebeccapurple')
    useDisplayStore.getState().setEditorTokenColor('vs-dark', 'type', '#fff')
    expect(useDisplayStore.getState().editorTokenColors['vs-dark'].type).toBe(before)
    expect(localStorageStore[KEY]).toBeUndefined()
  })

  it('keeps each base\'s customized palette across theme switches', async () => {
    const { useDisplayStore } = await loadStore(undefined, 'claude-dark')
    const { useThemeStore } = await import('../themeStore')
    useDisplayStore.getState().setEditorTokenColor('vs-dark', 'keyword', '#123456')
    useThemeStore.getState().setTheme('claude-light')
    useDisplayStore.getState().setEditorTokenColor('vs', 'keyword', '#654321')
    useThemeStore.getState().setTheme('claude-dark')
    expect(useDisplayStore.getState().editorTokenColors['vs-dark'].keyword).toBe('#123456')
    expect(useDisplayStore.getState().editorTokenColors['vs'].keyword).toBe('#654321')
  })

  it('hands out fresh defaults objects each call, never the shared module ones', async () => {
    const { defaultEditorTokenColors } = await loadStore()
    const a = defaultEditorTokenColors()
    a['vs'].keyword = '#000000'
    a['vs-dark'].keyword = '#000000'
    expect(defaultEditorTokenColors()['vs'].keyword).not.toBe('#000000')
    expect(defaultEditorTokenColors()['vs-dark'].keyword).not.toBe('#000000')
  })
})
