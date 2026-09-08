import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore, mediaState, domState, CSS_DEFAULTS } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }

  const mediaState = { matches: false }
  ;(globalThis as any).window = {
    matchMedia: () => ({
      get matches() { return mediaState.matches },
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }

  // Stand-in for index.css's [data-theme="..."] rules, covering the two
  // families exercised by these tests.
  const CSS_DEFAULTS: Record<string, Record<string, string>> = {
    'claude-dark': {
      '--color-accent': '217 119 87', '--color-bg': '#111111', '--color-panel': '#1a1a1a',
      '--color-sidebar': '#1a1a1a', '--color-tab-bar': '#1a1a1a', '--color-border': '#2a2a2a',
      '--color-fg': '#cccccc', '--color-fg-muted': '#999999', '--color-fg-subtle': '#666666',
    },
    'claude-light': {
      '--color-accent': '196 97 61', '--color-bg': '#f3f3f3', '--color-panel': '#ececec',
      '--color-sidebar': '#ececec', '--color-tab-bar': '#ececec', '--color-border': '#dddddd',
      '--color-fg': '#1e1e1e', '--color-fg-muted': '#555555', '--color-fg-subtle': '#888888',
    },
    'thomas-dark': {
      '--color-accent': '245 194 66', '--color-bg': '#1c1712', '--color-panel': '#2b2319',
      '--color-sidebar': '#2b2319', '--color-tab-bar': '#2b2319', '--color-border': '#4a3d29',
      '--color-fg': '#e8e0d0', '--color-fg-muted': '#b0a48c', '--color-fg-subtle': '#7d735d',
    },
    'thomas-light': {
      '--color-accent': '173 123 0', '--color-bg': '#f7f1e0', '--color-panel': '#efe6cd',
      '--color-sidebar': '#efe6cd', '--color-tab-bar': '#efe6cd', '--color-border': '#d8c89a',
      '--color-fg': '#2a2013', '--color-fg-muted': '#5c5238', '--color-fg-subtle': '#8a8064',
    },
  }

  const domState = { attr: null as string | null, inline: {} as Record<string, string> }
  const el = {
    getAttribute: (k: string) => (k === 'data-theme' ? domState.attr : null),
    setAttribute: (k: string, v: string) => { if (k === 'data-theme') domState.attr = v },
    removeAttribute: (k: string) => { if (k === 'data-theme') domState.attr = null },
    style: {
      setProperty: (k: string, v: string) => { domState.inline[k] = v },
      removeProperty: (k: string) => { delete domState.inline[k] },
      getPropertyValue: (k: string) => domState.inline[k] ?? '',
    },
  }
  ;(globalThis as any).document = { documentElement: el }
  ;(globalThis as any).getComputedStyle = (target: typeof el) => ({
    getPropertyValue: (k: string) =>
      target.style.getPropertyValue(k) || CSS_DEFAULTS[domState.attr ?? 'claude-dark']?.[k] || '',
  })

  return { localStorageStore, mediaState, domState, CSS_DEFAULTS }
})

import { useThemeStore } from '../themeStore'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '../customThemeStore'

function resetDom() {
  domState.attr = null
  Object.keys(domState.inline).forEach((k) => delete domState.inline[k])
}

beforeEach(() => {
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  mediaState.matches = false
  resetDom()
  useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  useCustomThemeStore.setState({ themes: [], activeId: null })
})

describe('createFromActive', () => {
  it('duplicates the active built-in family\'s light and dark palettes when no custom theme is active', () => {
    useThemeStore.setState({ theme: 'claude-dark' })
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    const theme = useCustomThemeStore.getState().themes.find((t) => t.id === id)!
    expect(theme.name).toBe('Sunset')
    expect(theme.baseFamily).toBe('claude')
    expect(theme.dark['--color-bg']).toBe('#111111')
    expect(theme.light['--color-bg']).toBe('#f3f3f3')
    expect(theme.dark['--color-accent']).toBe('#d97757')
    expect(useCustomThemeStore.getState().activeId).toBe(id)
  })

  it('duplicates the active custom theme\'s own stored palettes, not the built-in defaults, when a custom theme is active', () => {
    useCustomThemeStore.setState({
      themes: [{
        id: 'src', name: 'Source', baseFamily: 'claude',
        light: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#111111'])) as any,
        dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#222222'])) as any,
      }],
      activeId: 'src',
    })
    const id = useCustomThemeStore.getState().createFromActive('Copy')
    const theme = useCustomThemeStore.getState().themes.find((t) => t.id === id)!
    expect(theme.light['--color-bg']).toBe('#111111')
    expect(theme.dark['--color-bg']).toBe('#222222')
  })

  it('does not leave a visible data-theme change behind', () => {
    // useThemeStore.setState() only updates Zustand state, not the DOM (only
    // the store's own actions call applyTheme()) — set the attribute
    // directly to simulate "the DOM is currently showing thomas-dark" and
    // verify createFromActive's internal toggling restores exactly that.
    useThemeStore.setState({ theme: 'thomas-dark' })
    domState.attr = 'thomas-dark'
    useCustomThemeStore.getState().createFromActive('Test')
    expect(domState.attr).toBe('thomas-dark')
  })
})

describe('setActive', () => {
  it('applies the theme\'s current-variant palette to the DOM, converting accent to RGB-space', () => {
    useCustomThemeStore.setState({
      themes: [{
        id: 't1', name: 'T1', baseFamily: 'claude',
        light: { ...Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#111111'])), '--color-accent': '#ff0000' } as any,
        dark: { ...Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#222222'])), '--color-accent': '#00ff00' } as any,
      }],
      activeId: null,
    })
    useThemeStore.setState({ theme: 'claude-dark' })
    useCustomThemeStore.getState().setActive('t1')
    expect(domState.inline['--color-bg']).toBe('#222222')
    expect(domState.inline['--color-accent']).toBe('0 255 0')
  })

  it('setActive(null) removes all inline overrides', () => {
    useCustomThemeStore.getState().setActive(null)
    expect(Object.keys(domState.inline)).toHaveLength(0)
  })
})

describe('setSwatch', () => {
  it('updates the targeted theme/variant/var and re-applies to the DOM when that theme+variant is currently active', () => {
    const id = useCustomThemeStore.getState().createFromActive('Edit me')
    useThemeStore.setState({ theme: 'claude-dark' })
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#abcdef')
    expect(useCustomThemeStore.getState().themes[0].dark['--color-bg']).toBe('#abcdef')
    expect(domState.inline['--color-bg']).toBe('#abcdef')
  })

  it('does not touch the DOM when editing the variant that is not currently displayed', () => {
    const id = useCustomThemeStore.getState().createFromActive('Edit me')
    useThemeStore.setState({ theme: 'claude-dark' })
    const before = domState.inline['--color-bg']
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#abcdef')
    expect(useCustomThemeStore.getState().themes[0].light['--color-bg']).toBe('#abcdef')
    expect(domState.inline['--color-bg']).toBe(before)
  })
})

describe('deleteTheme', () => {
  it('removes the theme and clears activeId + DOM overrides if it was active', () => {
    const id = useCustomThemeStore.getState().createFromActive('Gone soon')
    useCustomThemeStore.getState().deleteTheme(id)
    expect(useCustomThemeStore.getState().themes).toHaveLength(0)
    expect(useCustomThemeStore.getState().activeId).toBeNull()
    expect(Object.keys(domState.inline)).toHaveLength(0)
  })
})

describe('rename', () => {
  it('updates the name without touching palettes', () => {
    const id = useCustomThemeStore.getState().createFromActive('Old Name')
    useCustomThemeStore.getState().rename(id, 'New Name')
    expect(useCustomThemeStore.getState().themes[0].name).toBe('New Name')
  })
})

describe('export / import', () => {
  it('exportTheme returns JSON with name, baseFamily, light, dark', () => {
    const id = useCustomThemeStore.getState().createFromActive('Exportable')
    const json = useCustomThemeStore.getState().exportTheme(id)
    const parsed = JSON.parse(json)
    expect(parsed.name).toBe('Exportable')
    expect(parsed.baseFamily).toBe('claude')
    expect(parsed.light['--color-bg']).toBeDefined()
    expect(parsed.dark['--color-bg']).toBeDefined()
  })

  it('importTheme adds a new theme with a fresh id, even if the JSON carries one', () => {
    const id = useCustomThemeStore.getState().createFromActive('Original')
    const json = useCustomThemeStore.getState().exportTheme(id)
    const result = useCustomThemeStore.getState().importTheme(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).not.toBe(id)
      expect(useCustomThemeStore.getState().themes).toHaveLength(2)
    }
  })

  it('fills missing vars from the built-in defaults for the recorded baseFamily', () => {
    const json = JSON.stringify({
      name: 'Partial', baseFamily: 'thomas',
      light: { '--color-bg': '#010101' },
      dark: { '--color-bg': '#020202' },
    })
    const result = useCustomThemeStore.getState().importTheme(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const theme = useCustomThemeStore.getState().themes.find((t) => t.id === result.id)!
      expect(theme.light['--color-bg']).toBe('#010101')
      expect(theme.light['--color-fg']).toBe('#2a2013')
      expect(theme.dark['--color-fg']).toBe('#e8e0d0')
    }
  })

  it('falls back to the claude family for an unrecognized baseFamily', () => {
    const json = JSON.stringify({ name: 'Unknown family', baseFamily: 'nonexistent', light: {}, dark: {} })
    const result = useCustomThemeStore.getState().importTheme(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const theme = useCustomThemeStore.getState().themes.find((t) => t.id === result.id)!
      expect(theme.baseFamily).toBe('claude')
    }
  })

  it('rejects malformed JSON', () => {
    const result = useCustomThemeStore.getState().importTheme('{not json')
    expect(result).toEqual({ ok: false, error: "Couldn't read that theme — check the pasted text and try again." })
  })

  it('rejects JSON missing name/light/dark', () => {
    const result = useCustomThemeStore.getState().importTheme(JSON.stringify({ foo: 'bar' }))
    expect(result.ok).toBe(false)
  })

  it('does not leak inline overrides from an active custom theme into the fallback-fill read', () => {
    const id = useCustomThemeStore.getState().createFromActive('Active One')
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#ff00ff')
    useThemeStore.setState({ theme: 'claude-light' })
    useCustomThemeStore.getState().setActive(id) // now '--color-bg' inline override is '#ff00ff'

    const json = JSON.stringify({ name: 'Partial 2', baseFamily: 'claude', light: {}, dark: {} })
    const result = useCustomThemeStore.getState().importTheme(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const theme = useCustomThemeStore.getState().themes.find((t) => t.id === result.id)!
      // must be the true claude-light default, not the '#ff00ff' inline override
      expect(theme.light['--color-bg']).toBe('#f3f3f3')
    }
    // the read must have restored the override it temporarily removed
    expect(domState.inline['--color-bg']).toBe('#ff00ff')
  })
})

describe('reacting to theme variant changes', () => {
  it('re-applies the active custom theme\'s palette when the underlying variant flips', () => {
    const id = useCustomThemeStore.getState().createFromActive('Flip me')
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#eeeeee')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#111111')
    useThemeStore.setState({ theme: 'claude-dark' })
    useCustomThemeStore.getState().setActive(id)
    expect(domState.inline['--color-bg']).toBe('#111111')

    useThemeStore.getState().setVariant(false) // switch to light
    expect(domState.inline['--color-bg']).toBe('#eeeeee')
  })
})
