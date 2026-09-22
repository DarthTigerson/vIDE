import { describe, it, expect, vi } from 'vitest'
import {
  deriveHighContrastTokens, defineCustomHighContrastTheme, CUSTOM_HIGH_CONTRAST_THEME_ID,
  defineCustomDefaultTheme, CUSTOM_DEFAULT_THEME_ID, THEME_PALETTES,
  defineCustomTokenTheme, CUSTOM_TOKENS_THEME_ID, tokenRules,
  highContrastMonacoThemeId, glassHighContrastMonacoThemeId, defineMonacoThemes,
} from '../monacoThemes'
import { hexToHsv, hexWithAlpha } from '@/lib/color'

describe('deriveHighContrastTokens', () => {
  it('ties the keyword token directly to the accent hue, and comment to a dimmer version of it', () => {
    const tokens = deriveHighContrastTokens('#5468c4', '#12151f') // atreus-dark's own accent/background
    const accentHue = hexToHsv('#5468c4').h
    expect(hexToHsv(tokens.keyword).h).toBeCloseTo(accentHue, 0)
    expect(hexToHsv(tokens.comment).h).toBeCloseTo(accentHue, 0)
  })

  it('produces bright, high-value tokens against a dark background', () => {
    const tokens = deriveHighContrastTokens('#d97757', '#1a1a1a')
    expect(hexToHsv(tokens.keyword).v).toBeGreaterThan(0.8)
  })

  it('produces darker, more saturated tokens against a light background, for legibility', () => {
    const tokens = deriveHighContrastTokens('#c4613d', '#f3f3f3')
    expect(hexToHsv(tokens.keyword).v).toBeLessThan(0.8)
    expect(hexToHsv(tokens.keyword).s).toBeGreaterThan(hexToHsv(deriveHighContrastTokens('#c4613d', '#1a1a1a').keyword).s)
  })

  it('keeps comment visibly dimmer than the keyword token', () => {
    const tokens = deriveHighContrastTokens('#8b5cf6', '#15111f')
    expect(hexToHsv(tokens.comment).s).toBeLessThan(hexToHsv(tokens.keyword).s)
  })

  it('gives each of the four syntax tokens a distinct hue', () => {
    const tokens = deriveHighContrastTokens('#5468c4', '#12151f')
    const hues = [tokens.keyword, tokens.type, tokens.string, tokens.number].map((h) => Math.round(hexToHsv(h).h))
    expect(new Set(hues).size).toBe(4)
  })
})

describe('defineCustomHighContrastTheme', () => {
  function fakeMonaco() {
    const defined: Record<string, any> = {}
    return {
      editor: { defineTheme: (id: string, data: any) => { defined[id] = data } },
      defined,
    }
  }

  it('picks a dark base for a dark custom background', () => {
    const monaco = fakeMonaco()
    defineCustomHighContrastTheme(monaco as any, {
      background: '#1a1a1a', foreground: '#cccccc', accent: '#d97757',
      border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555',
    }, false)
    expect(monaco.defined[CUSTOM_HIGH_CONTRAST_THEME_ID].base).toBe('vs-dark')
    expect(monaco.defined[CUSTOM_HIGH_CONTRAST_THEME_ID].colors['editor.background']).toBe('#1a1a1a')
  })

  it('picks a light base for a light custom background', () => {
    const monaco = fakeMonaco()
    defineCustomHighContrastTheme(monaco as any, {
      background: '#f3f3f3', foreground: '#1e1e1e', accent: '#c4613d',
      border: '#e0e0e0', fgMuted: '#717171', fgSubtle: '#999999',
    }, false)
    expect(monaco.defined[CUSTOM_HIGH_CONTRAST_THEME_ID].base).toBe('vs')
  })

  it('applies the glass alpha to the background when glass is true, same as defineCustomDefaultTheme', () => {
    const monaco = fakeMonaco()
    defineCustomHighContrastTheme(monaco as any, {
      background: '#1a1a1a', foreground: '#cccccc', accent: '#d97757',
      border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555',
    }, true)
    expect(monaco.defined[CUSTOM_HIGH_CONTRAST_THEME_ID].colors['editor.background']).toBe(hexWithAlpha('#1a1a1a', 0.25))
  })

  it('is safe to call again with new colours (Monaco redefines the same id in place)', () => {
    const monaco = fakeMonaco()
    defineCustomHighContrastTheme(monaco as any, {
      background: '#1a1a1a', foreground: '#cccccc', accent: '#d97757',
      border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555',
    }, false)
    defineCustomHighContrastTheme(monaco as any, {
      background: '#1a1a1a', foreground: '#cccccc', accent: '#61afef',
      border: '#3c3c3c', fgMuted: '#858585', fgSubtle: '#555555',
    }, false)
    expect(Object.keys(monaco.defined)).toEqual([CUSTOM_HIGH_CONTRAST_THEME_ID])
    const keywordRule = monaco.defined[CUSTOM_HIGH_CONTRAST_THEME_ID].rules.find((r: any) => r.token === 'keyword')
    expect(hexToHsv(`#${keywordRule.foreground}`).h).toBeCloseTo(hexToHsv('#61afef').h, 0)
  })
})

describe('glassHighContrastMonacoThemeId / defineMonacoThemes (built-in themes)', () => {
  function fakeMonaco() {
    const defined: Record<string, any> = {}
    return { editor: { defineTheme: (id: string, data: any) => { defined[id] = data } }, defined }
  }

  it('registers a distinct glass-alpha\'d id alongside the opaque Theme Colour Match id', () => {
    const monaco = fakeMonaco()
    defineMonacoThemes(monaco as any)
    const opaque = monaco.defined[highContrastMonacoThemeId('claude-dark')]
    const glass = monaco.defined[glassHighContrastMonacoThemeId('claude-dark')]
    expect(opaque.colors['editor.background']).toBe(THEME_PALETTES['claude-dark'].background)
    expect(glass.colors['editor.background']).toBe(hexWithAlpha(THEME_PALETTES['claude-dark'].background, 0.25))
    // same syntax token colours either way — only the background differs
    expect(glass.rules).toEqual(opaque.rules)
  })
})

describe('defineCustomDefaultTheme', () => {
  function fakeMonaco() {
    const defined: Record<string, any> = {}
    return { editor: { defineTheme: (id: string, data: any) => { defined[id] = data } }, defined }
  }

  it('substitutes only the background, keeping the base family\'s own token/foreground colours', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, 'claude-dark', '#565656', false)
    const theme = monaco.defined[CUSTOM_DEFAULT_THEME_ID]
    expect(theme.base).toBe('vs-dark')
    expect(theme.colors['editor.background']).toBe('#565656')
    expect(theme.colors['editor.foreground']).toBe(THEME_PALETTES['claude-dark'].foreground)
    expect(theme.colors['editorCursor.foreground']).toBe(THEME_PALETTES['claude-dark'].accent)
  })

  it('applies the glass alpha to the custom background when glass is true', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, 'claude-dark', '#565656', true)
    expect(monaco.defined[CUSTOM_DEFAULT_THEME_ID].colors['editor.background']).toBe(hexWithAlpha('#565656', 0.25))
  })

  it('follows the base family across families/variants, not just claude', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, 'link-light', '#abcabc', false)
    const theme = monaco.defined[CUSTOM_DEFAULT_THEME_ID]
    expect(theme.base).toBe('vs')
    expect(theme.colors['editor.foreground']).toBe(THEME_PALETTES['link-light'].foreground)
  })
})

describe('tokenRules', () => {
  it('paints plain `type` tokens, which is what a YAML/JSON key tokenizes as', () => {
    const rules = tokenRules(
      { keyword: '#111111', string: '#222222', number: '#333333', type: '#444444', comment: '#555555' },
      '#666666',
    )
    const type = rules.find((r) => r.token === 'type')
    expect(type).toBeDefined()
    expect(type!.foreground).toBe('444444')
    // 'type.identifier' would never match a bare 'type' token — Monaco
    // resolves theme rules by prefix, longest match wins.
    expect(rules.some((r) => r.token === 'type.identifier')).toBe(false)
  })
})

describe('defineCustomTokenTheme', () => {
  function fakeMonaco() {
    const defined: Record<string, any> = {}
    return {
      editor: { defineTheme: (id: string, data: any) => { defined[id] = data } },
      defined,
    }
  }

  const tokens = { keyword: '#ff0000', string: '#00ff00', number: '#0000ff', type: '#ffff00', comment: '#ff00ff' }

  it('uses the user\'s five colours over the active theme\'s own chrome', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, 'claude-dark', THEME_PALETTES['claude-dark'].background, false)
    const theme = monaco.defined[CUSTOM_TOKENS_THEME_ID]
    expect(theme.base).toBe('vs-dark')
    expect(theme.colors['editor.background']).toBe(THEME_PALETTES['claude-dark'].background)
    expect(theme.colors['editor.foreground']).toBe(THEME_PALETTES['claude-dark'].foreground)
    expect(theme.rules.find((r: any) => r.token === 'type').foreground).toBe('ffff00')
    expect(theme.rules.find((r: any) => r.token === 'keyword').foreground).toBe('ff0000')
  })

  it('follows the Glass panel style, like Default and Theme Colour Match', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, 'claude-dark', '#1e1e1e', true)
    expect(monaco.defined[CUSTOM_TOKENS_THEME_ID].colors['editor.background']).toBe(hexWithAlpha('#1e1e1e', 0.25))
  })

  it('takes its background from the caller, so a custom app theme\'s own bg wins', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, 'claude-dark', '#0a0f2b', false)
    expect(monaco.defined[CUSTOM_TOKENS_THEME_ID].colors['editor.background']).toBe('#0a0f2b')
  })
})

describe('defineMonacoThemes — the dynamically-redefined ids', () => {
  it('pre-defines all three so a pane can never select an unknown theme', async () => {
    // defineMonacoThemes() is one-shot per module instance, and other cases
    // in this file have already spent it — this one needs a fresh copy.
    vi.resetModules()
    const m = await import('../monacoThemes')
    const defined: Record<string, any> = {}
    m.defineMonacoThemes({
      editor: { defineTheme: (id: string, data: any) => { defined[id] = data } },
    } as any)
    // Monaco's setTheme() silently falls back to the light 'vs' theme for an
    // unknown id, and a later defineTheme() will NOT re-apply it to the live
    // editor — so selecting one of these before its defining effect in
    // Editor.tsx ran would strand the editor on 'vs'.
    expect(defined[m.CUSTOM_DEFAULT_THEME_ID]).toBeDefined()
    expect(defined[m.CUSTOM_HIGH_CONTRAST_THEME_ID]).toBeDefined()
    expect(defined[m.CUSTOM_TOKENS_THEME_ID]).toBeDefined()
    expect(defined[m.MARIO_MODE_THEME_ID]).toBeDefined()
  })
})
