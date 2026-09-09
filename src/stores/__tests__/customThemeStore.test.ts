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
      '--color-sidebar': '#1a1a1a', '--color-tab-bar': '#1a1a1a', '--color-popover': '#252526',
      '--color-border': '#2a2a2a',
      '--color-fg': '#cccccc', '--color-fg-muted': '#999999', '--color-fg-subtle': '#666666',
    },
    'claude-light': {
      '--color-accent': '196 97 61', '--color-bg': '#f3f3f3', '--color-panel': '#ececec',
      '--color-sidebar': '#ececec', '--color-tab-bar': '#ececec', '--color-popover': '#ececec',
      '--color-border': '#dddddd',
      '--color-fg': '#1e1e1e', '--color-fg-muted': '#555555', '--color-fg-subtle': '#888888',
    },
    'thomas-dark': {
      '--color-accent': '245 194 66', '--color-bg': '#1c1712', '--color-panel': '#2b2319',
      '--color-sidebar': '#2b2319', '--color-tab-bar': '#2b2319', '--color-popover': '#2b2319',
      '--color-border': '#4a3d29',
      '--color-fg': '#e8e0d0', '--color-fg-muted': '#b0a48c', '--color-fg-subtle': '#7d735d',
    },
    'thomas-light': {
      '--color-accent': '173 123 0', '--color-bg': '#f7f1e0', '--color-panel': '#efe6cd',
      '--color-sidebar': '#efe6cd', '--color-tab-bar': '#efe6cd', '--color-popover': '#fffcf2',
      '--color-border': '#d8c89a',
      '--color-fg': '#2a2013', '--color-fg-muted': '#5c5238', '--color-fg-subtle': '#8a8064',
    },
  }

  // Stand-in for index.css's [data-theme="..."][data-panel-style="glossy"/"glass"]
  // rules — real CSS uses the same alpha per var across every theme family, so
  // one entry (keyed only by panel style) is enough to exercise it.
  const PANEL_STYLE_DEFAULTS: Record<string, Record<string, string>> = {
    glossy: { '--color-bg': 'rgba(26, 26, 26, 0.5)', '--color-panel': 'rgba(30, 30, 30, 0.6)', '--color-sidebar': 'rgba(37, 37, 38, 0.5)', '--color-tab-bar': 'rgba(45, 45, 45, 0.65)' },
    glass: { '--color-bg': 'rgba(26, 26, 26, 0.2)', '--color-panel': 'rgba(30, 30, 30, 0.25)' },
  }

  const domState = {
    attr: null as string | null,
    panelStyle: null as string | null,
    inline: {} as Record<string, string>,
  }
  const el = {
    getAttribute: (k: string) => (k === 'data-theme' ? domState.attr : k === 'data-panel-style' ? domState.panelStyle : null),
    setAttribute: (k: string, v: string) => {
      if (k === 'data-theme') domState.attr = v
      if (k === 'data-panel-style') domState.panelStyle = v
    },
    removeAttribute: (k: string) => {
      if (k === 'data-theme') domState.attr = null
      if (k === 'data-panel-style') domState.panelStyle = null
    },
    style: {
      setProperty: (k: string, v: string) => { domState.inline[k] = v },
      removeProperty: (k: string) => { delete domState.inline[k] },
      getPropertyValue: (k: string) => domState.inline[k] ?? '',
    },
  }
  ;(globalThis as any).document = { documentElement: el }
  ;(globalThis as any).getComputedStyle = (target: typeof el) => ({
    getPropertyValue: (k: string) =>
      target.style.getPropertyValue(k) ||
      (domState.panelStyle ? PANEL_STYLE_DEFAULTS[domState.panelStyle]?.[k] : undefined) ||
      CSS_DEFAULTS[domState.attr ?? 'claude-dark']?.[k] || '',
  })

  return { localStorageStore, mediaState, domState, CSS_DEFAULTS }
})

import { useThemeStore, XTERM_THEMES, glassXtermTheme, XTERM_GLASS_ALPHA } from '../themeStore'
import { useCustomThemeStore, CUSTOM_COLOR_VARS, effectiveXtermTheme } from '../customThemeStore'
import { useDisplayStore } from '../displayStore'
import { hexWithAlpha } from '@/lib/color'

function resetDom() {
  domState.attr = null
  domState.panelStyle = null
  Object.keys(domState.inline).forEach((k) => delete domState.inline[k])
}

beforeEach(() => {
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
  mediaState.matches = false
  resetDom()
  useThemeStore.setState({ theme: 'claude-dark', matchSystem: false })
  useCustomThemeStore.setState({ themes: [], activeId: null })
  useDisplayStore.setState({ panelStyle: 'solid' })
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

describe('copyVariant', () => {
  it('overwrites the target variant with the source variant\'s palette', () => {
    const id = useCustomThemeStore.getState().createFromActive('Copy me')
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#111111')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#222222')
    useCustomThemeStore.getState().copyVariant(id, 'light', 'dark')
    const theme = useCustomThemeStore.getState().themes[0]
    expect(theme.dark['--color-bg']).toBe('#111111')
    expect(theme.light['--color-bg']).toBe('#111111')
  })

  it('re-applies to the DOM when the target variant is currently active and displayed', () => {
    const id = useCustomThemeStore.getState().createFromActive('Copy me')
    useThemeStore.setState({ theme: 'claude-dark' })
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#eeeeee')
    useCustomThemeStore.getState().copyVariant(id, 'light', 'dark')
    expect(domState.inline['--color-bg']).toBe('#eeeeee')
  })

  it('does not touch the DOM when the target variant is not currently displayed', () => {
    const id = useCustomThemeStore.getState().createFromActive('Copy me')
    useThemeStore.setState({ theme: 'claude-dark' })
    const before = domState.inline['--color-bg']
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#eeeeee')
    useCustomThemeStore.getState().copyVariant(id, 'dark', 'light')
    expect(domState.inline['--color-bg']).toBe(before)
  })

  it('is a no-op for an unknown theme id', () => {
    expect(() => useCustomThemeStore.getState().copyVariant('missing', 'light', 'dark')).not.toThrow()
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

describe('reading built-in defaults while a non-solid panel style is active', () => {
  it('createFromActive picks up the real base colour, not black, when Glossy is active', () => {
    domState.panelStyle = 'glossy'
    useDisplayStore.setState({ panelStyle: 'glossy' })
    const id = useCustomThemeStore.getState().createFromActive('Under Glossy')
    const theme = useCustomThemeStore.getState().themes.find((t) => t.id === id)!
    expect(theme.dark['--color-bg']).toBe('#111111')
    expect(theme.dark['--color-panel']).toBe('#1a1a1a')
    expect(theme.dark['--color-sidebar']).toBe('#1a1a1a')
  })

  it('createFromActive picks up the real base colour, not black, when Glass is active', () => {
    domState.panelStyle = 'glass'
    useDisplayStore.setState({ panelStyle: 'glass' })
    const id = useCustomThemeStore.getState().createFromActive('Under Glass')
    const theme = useCustomThemeStore.getState().themes.find((t) => t.id === id)!
    expect(theme.dark['--color-bg']).toBe('#111111')
    expect(theme.dark['--color-panel']).toBe('#1a1a1a')
  })

  it('restores the data-panel-style attribute it temporarily removed', () => {
    domState.panelStyle = 'glossy'
    useDisplayStore.setState({ panelStyle: 'glossy' })
    useCustomThemeStore.getState().createFromActive('Under Glossy')
    expect(domState.panelStyle).toBe('glossy')
  })

  it('importTheme backfills the real base colour, not black, when Glass is active', () => {
    domState.panelStyle = 'glass'
    useDisplayStore.setState({ panelStyle: 'glass' })
    const json = JSON.stringify({ name: 'Partial under glass', baseFamily: 'claude', light: {}, dark: {} })
    const result = useCustomThemeStore.getState().importTheme(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const theme = useCustomThemeStore.getState().themes.find((t) => t.id === result.id)!
      expect(theme.dark['--color-bg']).toBe('#111111')
    }
  })
})

describe('applying a custom theme\'s palette under the active panel style', () => {
  it('writes the colour unchanged under Solid', () => {
    useDisplayStore.setState({ panelStyle: 'solid' })
    const id = useCustomThemeStore.getState().createFromActive('Solid theme')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    expect(domState.inline['--color-bg']).toBe('#123456')
  })

  it('applies the Glossy alpha to background/panel/sidebar/tab-bar vars', () => {
    useDisplayStore.setState({ panelStyle: 'glossy' })
    const id = useCustomThemeStore.getState().createFromActive('Glossy theme')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    expect(domState.inline['--color-bg']).toBe(hexWithAlpha('#123456', 0.5))
  })

  it('applies the Glass alpha to background/panel vars only', () => {
    useDisplayStore.setState({ panelStyle: 'glass' })
    const id = useCustomThemeStore.getState().createFromActive('Glass theme')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-border', '#abcdef')
    expect(domState.inline['--color-bg']).toBe(hexWithAlpha('#123456', 0.2))
    // vars glass leaves alone (e.g. border) stay untouched, matching how the
    // built-in [data-theme][data-panel-style="glass"] rules only redeclare bg/panel
    expect(domState.inline['--color-border']).toBe('#abcdef')
  })

  it('re-applies with the new alpha when the panel style changes while a custom theme is active', () => {
    const id = useCustomThemeStore.getState().createFromActive('Switcheroo')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    expect(domState.inline['--color-bg']).toBe('#123456')

    useDisplayStore.getState().setPanelStyle('glass')
    expect(domState.inline['--color-bg']).toBe(hexWithAlpha('#123456', 0.2))
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

// These tests exercise load()'s validation of persisted data at module-scope
// evaluation time (the `const initial = load()` line runs once, at import).
// To re-trigger that module-load code fresh per test, force a clean module
// registry with vi.resetModules() and dynamically re-import the module —
// the statically-imported `useCustomThemeStore`/`useThemeStore` above still
// point at the original (already-evaluated) module instances, so they're
// untouched by this and safe to keep using in every other describe block.
describe('load() repairs malformed/incomplete persisted data at module-load time', () => {
  const STORAGE_KEY = 'vide:customThemes'

  it('repairs a persisted theme missing light/dark entirely, backfilling from the built-in default, instead of dropping it', async () => {
    localStorageStore[STORAGE_KEY] = JSON.stringify({
      themes: [{ id: 'bad', name: 'Bad', baseFamily: 'claude' }],
      activeId: 'bad',
    })
    vi.resetModules()
    const mod = await import('../customThemeStore')
    const state = mod.useCustomThemeStore.getState()
    expect(state.themes).toHaveLength(1)
    expect(state.themes[0].dark['--color-bg']).toBe('#111111')
    expect(state.themes[0].light['--color-bg']).toBe('#f3f3f3')
    expect(state.activeId).toBe('bad')
  })

  it('backfills only the missing vars in a persisted theme whose palette has some of the 9 vars', async () => {
    localStorageStore[STORAGE_KEY] = JSON.stringify({
      themes: [{
        id: 'bad2', name: 'Bad2', baseFamily: 'claude',
        light: { '--color-bg': '#123123' }, // missing the other 9 vars
        dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#222222'])),
      }],
      activeId: null,
    })
    vi.resetModules()
    const mod = await import('../customThemeStore')
    const theme = mod.useCustomThemeStore.getState().themes[0]
    expect(theme.light['--color-bg']).toBe('#123123') // kept as given
    expect(theme.light['--color-fg']).toBe('#1e1e1e') // backfilled from claude-light default
    expect(theme.dark['--color-bg']).toBe('#222222') // already complete, untouched
  })

  it('drops an entry with no usable id/name, but keeps and repairs a malformed-but-identifiable one alongside it', async () => {
    const validTheme = {
      id: 'good', name: 'Good', baseFamily: 'claude',
      light: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#eeeeee'])),
      dark: Object.fromEntries(CUSTOM_COLOR_VARS.map((d) => [d.varName, '#111111'])),
    }
    const malformedButIdentifiable = { id: 'bad', name: 'Bad', baseFamily: 'claude', light: {} }
    const unusable = { name: 'No id at all' }
    localStorageStore[STORAGE_KEY] = JSON.stringify({
      themes: [validTheme, malformedButIdentifiable, unusable],
      activeId: 'good',
    })
    vi.resetModules()
    const mod = await import('../customThemeStore')
    const state = mod.useCustomThemeStore.getState()
    expect(state.themes.map((t) => t.id)).toEqual(['good', 'bad'])
    expect(state.themes[0].light['--color-bg']).toBe('#eeeeee') // valid theme untouched
    expect(state.themes[1].light['--color-bg']).toBe('#f3f3f3') // malformed theme repaired
    expect(state.activeId).toBe('good')
  })
})

describe('effectiveXtermTheme', () => {
  it('returns the built-in xterm theme unchanged when no custom theme is active', () => {
    expect(effectiveXtermTheme('claude-dark', false)).toEqual(XTERM_THEMES['claude-dark'])
  })

  it('returns the built-in glass xterm theme unchanged when no custom theme is active', () => {
    expect(effectiveXtermTheme('claude-dark', true)).toEqual(glassXtermTheme('claude-dark'))
  })

  it('overrides only the background with the active custom theme\'s current-variant colour', () => {
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    useThemeStore.setState({ theme: 'claude-dark' })
    const result = effectiveXtermTheme('claude-dark', false)
    expect(result.background).toBe('#123456')
    expect(result.foreground).toBe(XTERM_THEMES['claude-dark'].foreground)
  })

  it('applies the glass alpha to the custom background when glass is true', () => {
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    useCustomThemeStore.getState().setSwatch(id, 'dark', '--color-bg', '#123456')
    useThemeStore.setState({ theme: 'claude-dark' })
    const result = effectiveXtermTheme('claude-dark', true)
    expect(result.background).toBe(hexWithAlpha('#123456', XTERM_GLASS_ALPHA))
  })

  it('uses the light-variant background when the current variant is light', () => {
    const id = useCustomThemeStore.getState().createFromActive('Sunset')
    useCustomThemeStore.getState().setSwatch(id, 'light', '--color-bg', '#abcabc')
    useThemeStore.setState({ theme: 'claude-light' })
    expect(effectiveXtermTheme('claude-light', false).background).toBe('#abcabc')
  })
})
