// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { KNOWN_SYNCED_ENUMS, findIncompatibleSyncValue } from '../syncCompat'
import { THEME_OPTIONS } from '@/stores/themeStore'
import { BACKGROUND_IMAGE_OPTIONS } from '@/stores/displayStore'

describe('KNOWN_SYNCED_ENUMS drift guard', () => {
  // If a new theme or background ships without being added to syncCompat, an
  // older build would silently reject it as "incompatible" — but worse, a build
  // that owns the new option would wrongly gate on it. Keep the lists in lockstep.
  it('lists exactly the theme ids this build renders', () => {
    const fromOptions = THEME_OPTIONS.map((o) => o.id).sort()
    expect([...KNOWN_SYNCED_ENUMS['vide:theme']].sort()).toEqual(fromOptions)
  })

  it('lists exactly the background images this build renders', () => {
    const fromOptions = BACKGROUND_IMAGE_OPTIONS.map((o) => o.value).sort()
    expect([...KNOWN_SYNCED_ENUMS['vide:backgroundImage']].sort()).toEqual(fromOptions)
  })
})

describe('findIncompatibleSyncValue', () => {
  it('returns null when every synced value is known', () => {
    const data = {
      general: { 'vide:theme': 'claude-dark', 'vide:backgroundImage': 'none', 'vide:font': 'Menlo, monospace' },
    }
    expect(findIncompatibleSyncValue(data)).toBeNull()
  })

  it('flags an unknown theme (the value a newer build would push)', () => {
    const data = { general: { 'vide:theme': 'some-future-theme-dark' } }
    expect(findIncompatibleSyncValue(data)).toEqual({ key: 'vide:theme', value: 'some-future-theme-dark' })
  })

  it('flags an unknown background image', () => {
    const data = { general: { 'vide:backgroundImage': 'brandNewArt' } }
    expect(findIncompatibleSyncValue(data)).toEqual({ key: 'vide:backgroundImage', value: 'brandNewArt' })
  })

  it('ignores keys that are not closed enums', () => {
    const data = { general: { 'vide:editorTokenColors': '{"anything":"goes"}', 'vide:commitMessage:foo': 'whatever' } }
    expect(findIncompatibleSyncValue(data)).toBeNull()
  })
})
