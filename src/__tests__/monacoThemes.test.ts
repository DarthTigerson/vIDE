import { describe, it, expect, vi } from 'vitest'
import {
  deriveHighContrastTokens, defineCustomHighContrastTheme, CUSTOM_HIGH_CONTRAST_THEME_ID,
  defineCustomDefaultTheme, CUSTOM_DEFAULT_THEME_ID, THEME_PALETTES,
  defineCustomTokenTheme, CUSTOM_TOKENS_THEME_ID, tokenRules, editorChromeFor,
  highContrastMonacoThemeId, glassHighContrastMonacoThemeId,
} from '../monacoThemes'
import { hexToHsv, hexWithAlpha } from '@/lib/color'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

  it('registers a distinct glass-alpha\'d id alongside the opaque Theme Colour Match id', async () => {
    // One-shot per module instance, and the defineCustom*Theme cases above
    // already spend it — needs a fresh copy.
    vi.resetModules()
    const { defineMonacoThemes } = await import('../monacoThemes')
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

// A custom app theme's chrome: deliberately unlike every built-in palette so
// a test can tell whose colour landed where.
const CHROME = {
  background: '#102030', foreground: '#aaff00', accent: '#ff8800',
  border: '#ff00aa', fgMuted: '#00aaff', fgSubtle: '#ffaa00',
}

function fakeMonaco() {
  const defined: Record<string, any> = {}
  return { editor: { defineTheme: (id: string, data: any) => { defined[id] = data } }, defined }
}

describe('defineCustomDefaultTheme', () => {
  it('paints the custom theme\'s own text, accent and line-number colours, not the base family\'s', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, CHROME, false)
    const theme = monaco.defined[CUSTOM_DEFAULT_THEME_ID]
    expect(theme.base).toBe('vs-dark')
    expect(theme.rules).toEqual([])
    expect(theme.colors['editor.background']).toBe('#102030')
    expect(theme.colors['editor.foreground']).toBe('#aaff00')
    expect(theme.colors['editorCursor.foreground']).toBe('#ff8800')
    expect(theme.colors['editorLineNumber.foreground']).toBe('#ffaa00')
    expect(theme.colors['editorLineNumber.activeForeground']).toBe('#00aaff')
    expect(theme.colors['editorIndentGuide.background']).toBe('#ff00aa')
  })

  it('applies the glass alpha to the custom background when glass is true', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, CHROME, true)
    expect(monaco.defined[CUSTOM_DEFAULT_THEME_ID].colors['editor.background']).toBe(hexWithAlpha('#102030', 0.25))
  })

  it('picks the light base for a light custom background, whatever the base family', () => {
    const monaco = fakeMonaco()
    defineCustomDefaultTheme(monaco as any, { ...CHROME, background: '#f4f4f4' }, false)
    expect(monaco.defined[CUSTOM_DEFAULT_THEME_ID].base).toBe('vs')
  })
})

describe('tokenRules', () => {
  const T = { keyword: '#111111', string: '#222222', number: '#333333', type: '#444444', comment: '#555555' }
  const rules = tokenRules(T, '#666666', '#777777')
  const colourOf = (token: string) => rules.find((r) => r.token === token)?.foreground

  it('paints plain `type` tokens, which is what a YAML key tokenizes as', () => {
    expect(colourOf('type')).toBe('444444')
    // 'type.identifier' would never match a bare 'type' token — Monaco
    // resolves theme rules by prefix, longest match wins.
    expect(rules.some((r) => r.token === 'type.identifier')).toBe(false)
  })

  // Monaco's built-in vs/vs-dark carry rules for narrower tokens than our
  // five; with inherit: true the longest prefix wins, so without an explicit
  // rule of our own each of these kept Monaco's stock colour under Custom,
  // Theme Colour Match and Mario Mode alike.
  it.each([
    ['string.value.json', '222222'], ['string.key.json', '444444'], ['keyword.json', '111111'],
    ['number.hex', '333333'], ['keyword.flow', '111111'],
    ['tag', '111111'], ['metatag', '111111'], ['metatag.html', '111111'], ['metatag.content.html', '444444'],
    ['attribute.name', '444444'], ['attribute.value', '222222'], ['attribute.value.html', '222222'],
    ['attribute.value.number.css', '333333'], ['attribute.value.unit.css', '333333'], ['attribute.value.hex.css', '333333'],
    ['string.yaml', '222222'], ['string.html', '222222'], ['annotation', '444444'], ['key', '444444'],
    ['delimiter.html', '666666'], ['delimiter.xml', '666666'],
    ['variable', '777777'], ['variable.predefined', '777777'], ['variable.parameter', '777777'],
  ])('overrides Monaco\'s own %s rule', (token, colour) => {
    expect(colourOf(token)).toBe(colour)
  })

  it('leaves no coloured rule of Monaco\'s built-in vs or vs-dark themes un-overridden', () => {
    const source = readFileSync(join(process.cwd(), 'node_modules/monaco-editor/esm/vs/editor/standalone/common/themes.js'), 'utf8')
    const builtIn = [...source.matchAll(/token: '([^']+)', foreground:/g)].map((m) => m[1])
    expect(builtIn.length).toBeGreaterThan(30)
    // 'invalid' stays Monaco's error red on purpose.
    const missing = [...new Set(builtIn)].filter((t) => t !== 'invalid' && !rules.some((r) => r.token === t))
    expect(missing).toEqual([])
  })
})

describe('defineCustomTokenTheme', () => {
  const tokens = { keyword: '#ff0000', string: '#00ff00', number: '#0000ff', type: '#ffff00', comment: '#ff00ff' }

  it('uses the user\'s five colours over the chrome it is given', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, CHROME, false)
    const theme = monaco.defined[CUSTOM_TOKENS_THEME_ID]
    expect(theme.base).toBe('vs-dark')
    expect(theme.colors['editor.background']).toBe('#102030')
    expect(theme.colors['editor.foreground']).toBe('#aaff00')
    expect(theme.colors['editorCursor.foreground']).toBe('#ff8800')
    expect(theme.rules.find((r: any) => r.token === 'type').foreground).toBe('ffff00')
    expect(theme.rules.find((r: any) => r.token === 'keyword').foreground).toBe('ff0000')
    expect(theme.rules.find((r: any) => r.token === 'delimiter').foreground).toBe('00aaff')
  })

  it('follows the Glass panel style, like Default and Theme Colour Match', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, CHROME, true)
    expect(monaco.defined[CUSTOM_TOKENS_THEME_ID].colors['editor.background']).toBe(hexWithAlpha('#102030', 0.25))
  })

  it('takes a built-in family\'s chrome via editorChromeFor', () => {
    const monaco = fakeMonaco()
    defineCustomTokenTheme(monaco as any, tokens, editorChromeFor(THEME_PALETTES['claude-dark']), false)
    const theme = monaco.defined[CUSTOM_TOKENS_THEME_ID]
    expect(theme.colors['editor.background']).toBe(THEME_PALETTES['claude-dark'].background)
    expect(theme.colors['editor.foreground']).toBe(THEME_PALETTES['claude-dark'].foreground)
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

  it("never lets the first pane's placeholders overwrite a custom definition that ran before it", async () => {
    // Launching on a Settings tab: Editor.tsx's effects define the real
    // colours before any pane has mounted, then the first pane's beforeMount
    // runs defineMonacoThemes() for the first time.
    vi.resetModules()
    const m = await import('../monacoThemes')
    const defined: Record<string, any> = {}
    const monaco = { editor: { defineTheme: (id: string, data: any) => { defined[id] = data } } } as any
    const keyword = (id: string) => defined[id].rules.find((r: any) => r.token === 'keyword')?.foreground
    m.defineCustomTokenTheme(monaco, { ...m.DEFAULT_TOKENS['vs-dark'], keyword: '#ff0000' }, { ...CHROME, background: '#1a1a1a' }, false)
    m.defineCustomHighContrastTheme(monaco, {
      background: '#12151f', foreground: '#ffffff', accent: '#5468c4', border: '#333333', fgMuted: '#999999', fgSubtle: '#666666',
    }, false)
    m.defineCustomDefaultTheme(monaco, { ...CHROME, background: '#123456' }, false)
    const hcKeyword = keyword(m.CUSTOM_HIGH_CONTRAST_THEME_ID)
    m.defineMonacoThemes(monaco)
    expect(keyword(m.CUSTOM_TOKENS_THEME_ID)).toBe('ff0000')
    expect(keyword(m.CUSTOM_HIGH_CONTRAST_THEME_ID)).toBe(hcKeyword)
    expect(defined[m.CUSTOM_DEFAULT_THEME_ID].colors['editor.background']).toBe('#123456')
  })
})
