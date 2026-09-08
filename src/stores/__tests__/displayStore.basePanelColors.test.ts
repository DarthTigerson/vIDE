import { describe, it, expect, beforeEach, vi } from 'vitest'

const { domState } = vi.hoisted(() => {
  const domState = { panelStyle: null as string | null }

  const BASE: Record<string, string> = {
    '--color-bg': '#111111',
    '--color-panel': '#1a1a1a',
    '--color-sidebar': '#1a1a1a',
    '--color-tab-bar': '#1a1a1a',
    '--color-border': '#2a2a2a',
  }
  // Stand-in for [data-theme="x"][data-panel-style="glossy"]'s translucent
  // override — real index.css only redefines bg/panel/sidebar/tab-bar for
  // glossy, never --color-border, matching that asymmetry here too.
  const GLOSSY: Record<string, string> = {
    '--color-bg': 'rgba(26, 26, 26, 0.5)',
    '--color-panel': 'rgba(30, 30, 30, 0.6)',
    '--color-sidebar': 'rgba(37, 37, 38, 0.5)',
    '--color-tab-bar': 'rgba(45, 45, 45, 0.65)',
  }

  const el = {
    style: { setProperty: () => {} },
    getAttribute: (k: string) => (k === 'data-panel-style' ? domState.panelStyle : null),
    setAttribute: (k: string, v: string) => { if (k === 'data-panel-style') domState.panelStyle = v },
    removeAttribute: (k: string) => { if (k === 'data-panel-style') domState.panelStyle = null },
  }
  ;(global as any).document = { documentElement: el }
  ;(global as any).localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
  ;(global as any).getComputedStyle = () => ({
    getPropertyValue: (k: string) => (domState.panelStyle === 'glossy' && k in GLOSSY ? GLOSSY[k] : BASE[k] ?? ''),
  })

  return { domState }
})

import { basePanelColors } from '../displayStore'

beforeEach(() => {
  domState.panelStyle = null
})

describe('basePanelColors', () => {
  it('returns the theme base colours when no panel style is active', () => {
    expect(basePanelColors()).toEqual({
      bg: '#111111', panel: '#1a1a1a', sidebar: '#1a1a1a', tabBar: '#1a1a1a', border: '#2a2a2a',
    })
  })

  it('ignores glossy\'s translucent override and still returns the base colours', () => {
    domState.panelStyle = 'glossy'
    expect(basePanelColors()).toEqual({
      bg: '#111111', panel: '#1a1a1a', sidebar: '#1a1a1a', tabBar: '#1a1a1a', border: '#2a2a2a',
    })
  })

  it('restores the original data-panel-style attribute afterward', () => {
    domState.panelStyle = 'glossy'
    basePanelColors()
    expect(domState.panelStyle).toBe('glossy')
  })

  it('leaves data-panel-style absent afterward if it was absent before', () => {
    domState.panelStyle = null
    basePanelColors()
    expect(domState.panelStyle).toBeNull()
  })
})
